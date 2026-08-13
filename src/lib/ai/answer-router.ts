// =========================================================================
// Hybrid answer router — the seam between the free deterministic engine and
// the optional BYOK LLM. It decides, per question, whether the app can answer
// for free and correctly from the student's own data, or whether the question
// is open-ended enough ("why / what-if / should I / compare") to be worth
// escalating to Gemini. The deterministic answer is ALWAYS produced as the
// ground truth and the graceful fallback, so a missing/exhausted key never
// turns into an error — it just means no LLM layer on top.
//
// Pure + framework-free so it's unit-testable and callable from the floating
// assistant without any live key. The actual LLM streaming stays in the
// existing /api/chat/stream path; this only makes the routing decision.
// =========================================================================

import { answerDegreeQuestion, socialTalkKind, type QAAnswer, type QAContext } from "@/lib/degree-qa";

export type AnswerSource = "rules" | "llm";

export interface RoutedDecision {
  /** The deterministic answer — always present, from the student's own data. */
  deterministic: QAAnswer;
  /** Did the deterministic engine confidently match a known intent? */
  matched: boolean;
  /**
   * Should this question be escalated to the LLM? True when the rules can't
   * answer it OR when it's an open-ended reasoning question the rules can't
   * enumerate (even if a keyword happened to match). The caller only actually
   * calls the LLM when a key is available; otherwise it shows `deterministic`.
   */
  shouldEscalate: boolean;
  /** Why we escalated (for telemetry / a source badge). */
  reason: "no-match" | "reasoning" | "follow-up" | "course-code" | "social" | "none";
}

// Markers of an open-ended question that benefits from LLM reasoning rather
// than a canned rule answer — Hebrew + English. Kept deliberately small and
// high-precision: matching one of these means "the student wants judgment,
// not a lookup". Normalized (niqqud/punctuation-insensitive) at match time.
const REASONING_MARKERS = [
  // Hebrew
  "למה",
  "מה אם",
  "מה יקרה",
  "כדאי",
  "עדיף",
  "שווה",
  "השווה",
  "להשוות",
  "לבחור בין",
  "מה ההבדל",
  "איך כדאי",
  "מה עדיף",
  "מומלץ",
  "תמליץ",
  "המלצה",
  "אסטרטגי",
  "להסתכן",
  "כדאי לי",
  // Emotional check-ins deserve the persona's voice when a key exists —
  // the deterministic empathy handler stays the graceful fallback.
  "חושש",
  "מפחד",
  "לחוץ",
  "מודאג",
  "קשה לי",
  // English
  "why",
  "what if",
  "should i",
  "compare",
  "better to",
  "difference between",
  "recommend",
  "strategy",
  "worth it",
  "worried",
  "stressed",
  "trade-off",
  "tradeoff",
];

/** Mirror of degree-qa's normalizer, kept local so the two modules stay
 *  independent. Folds niqqud, maqaf, geresh/quotes, punctuation and Hebrew
 *  final-letter forms so markers match paraphrases. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/־/g, " ")
    .replace(/[֑-ׇ]/g, "")
    .replace(/[׳״'"`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/ך/g, "כ")
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ף/g, "פ")
    .replace(/ץ/g, "צ")
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_MARKERS = REASONING_MARKERS.map(normalize).filter(Boolean);

/**
 * #30 (12.7) — is this a FOLLOW-UP that leans on the conversation so far?
 * "יש עוד מגבלות על הבינארי?" after a binary answer must NOT get the same
 * canned deterministic paragraph again — it needs the LLM with history.
 * Heuristics (normalized text): continuation openers, "עוד/גם" + question,
 * or a very short anaphoric question ("וזה?", "ולמה?", "מה עם זה?").
 */
export function isFollowUpQuestion(question: string): boolean {
  const q = normalize(question);
  if (!q) return false;
  const words = q.split(" ");
  const OPENERS = [
    "יש עוד", "מה עוד", "עוד משהו", "וגמ", "ומה", "ואיכ", "ולמה", "וזה", "ואמ",
    "אז מה", "אז איכ", "מה עמ", "מה לגבי", "רגע ו", "הבנתי", "אוקיי ו", "או קיי ו",
    "and what", "what else", "anything else", "what about", "so what", "got it",
  ];
  if (OPENERS.some((o) => q.startsWith(o))) return true;
  // "…יש עוד…" anywhere in a short question is a continuation too.
  if (words.length <= 8 && / עוד /.test(` ${q} `)) return true;
  // Tiny anaphoric questions lean on context by definition.
  if (words.length <= 3 && /(זה|הוא|היא|זו|it|that)/.test(q)) return true;
  return false;
}

/** Does the question read as an open-ended reasoning request? */
export function isReasoningQuestion(question: string): boolean {
  const q = normalize(question);
  if (!q) return false;
  return NORMALIZED_MARKERS.some((m) => q.includes(m));
}

// Yedion course-code shape: "0618-1012". Live-QA (24.7) found that naming a
// SPECIFIC course this way ("ספר לי על 0618-1012 — כמה הוא קשה") still got
// hijacked by the generic personal-stat handlers below (bare "ממוצע"/"ציון" —
// degree-qa.ts has no per-catalog-course knowledge, only the student's OWN
// data, so it can never correctly answer a "tell me about course X" question;
// it just happens to score > 0 on the wrong handler and answers something
// else entirely, silently, with no escalation). An explicit course code is an
// unambiguous, cheap-to-detect signal that the question is catalog-scoped —
// route it to the LLM (which sees the real per-course data when the course is
// in the student's own lists, and is now instructed to say so honestly when
// it isn't) instead of trusting the keyword scorer.
const COURSE_CODE_PATTERN = /\b\d{4}-\d{4}\b/;

/** Does the question name a specific catalog course by its Yedion code? */
export function mentionsCourseCode(question: string): boolean {
  return COURSE_CODE_PATTERN.test(question);
}

/**
 * Decide how to answer a question. Always computes the deterministic answer;
 * flags escalation when the rules don't match or the question wants judgment.
 */
export function routeQuestion(
  question: string,
  ctx: QAContext,
  opts?: { hasHistory?: boolean },
): RoutedDecision {
  const deterministic = answerDegreeQuestion(question, ctx);
  const matched = deterministic.matched === true;
  const reasoning = isReasoningQuestion(question);
  // #30 — a follow-up in an ongoing conversation must not re-serve the same
  // canned paragraph; it escalates to the LLM (which has the history). The
  // deterministic answer remains the graceful no-key fallback.
  const followUp = Boolean(opts?.hasHistory) && isFollowUpQuestion(question);
  // A named course code is catalog-scoped, not personal-stat-scoped — never
  // let the generic "ממוצע"/"ציון"/"בחירה" handlers silently answer for it
  // (24.7 live-QA finding). Checked LAST so it doesn't override a genuine
  // per-course match from degree-qa's own course-scoped handlers above.
  const courseCode = mentionsCourseCode(question);
  // #22 — "ומה שלומך?" is answerable deterministically (a warm one-liner), but
  // warmth is exactly where the persona earns its keep: escalate so a keyed
  // student hears the King/Referent, and keep the fixed line as the fallback.
  const social = socialTalkKind(question) !== null;

  const shouldEscalate = !matched || reasoning || followUp || courseCode || social;
  const reason: RoutedDecision["reason"] = !matched
    ? "no-match"
    : followUp
      ? "follow-up"
      : social
        ? "social"
        : reasoning
          ? "reasoning"
          : courseCode
            ? "course-code"
            : "none";

  return { deterministic, matched, shouldEscalate, reason };
}
