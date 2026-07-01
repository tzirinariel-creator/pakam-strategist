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

import { answerDegreeQuestion, type QAAnswer, type QAContext } from "@/lib/degree-qa";

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
  reason: "no-match" | "reasoning" | "none";
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

/** Does the question read as an open-ended reasoning request? */
export function isReasoningQuestion(question: string): boolean {
  const q = normalize(question);
  if (!q) return false;
  return NORMALIZED_MARKERS.some((m) => q.includes(m));
}

/**
 * Decide how to answer a question. Always computes the deterministic answer;
 * flags escalation when the rules don't match or the question wants judgment.
 */
export function routeQuestion(question: string, ctx: QAContext): RoutedDecision {
  const deterministic = answerDegreeQuestion(question, ctx);
  const matched = deterministic.matched === true;
  const reasoning = isReasoningQuestion(question);

  // Escalate when the rules couldn't answer, or when the student is asking for
  // judgment/comparison the enumerated rules can't fully give — even if a
  // keyword matched (e.g. "כדאי לי לקחת בינארי בקורס הזה?" matches "בינארי" but
  // really wants advice). A pure lookup that matched and isn't a reasoning
  // question stays free.
  const shouldEscalate = !matched || reasoning;
  const reason: RoutedDecision["reason"] = !matched
    ? "no-match"
    : reasoning
      ? "reasoning"
      : "none";

  return { deterministic, matched, shouldEscalate, reason };
}
