// =========================================
// Deterministic Degree Q&A
// =========================================
// A free, no-LLM "ask me about your degree" engine. It matches a natural-
// language question to an intent and answers from the STUDENT'S OWN DATA plus
// the domain knowledge already encoded in the app. Zero cost, zero
// hallucination — the same deterministic spirit as the rest of Pakamon.
//
// Pure + testable: the UI fills a QAContext from its tRPC queries and calls
// answerDegreeQuestion().

import { CREDIT_REQUIREMENTS, GRADE_REQUIREMENTS, GRADE_WEIGHTS, SEMINAR_REQUIREMENTS, resolveEnglishLevel } from "@/lib/constants";
import { daysUntilLabel } from "@/lib/days-until";
import { normalizeHebrewForMatch } from "@/lib/hebrew-normalize";
import { israelDayKeyMs, storedDateKeyMs } from "@/lib/civil-day";

export interface QAContext {
  isHe: boolean;
  /** No courses saved yet — typically mid-onboarding, where the wizard still
   *  holds everything in memory. Credit/grade arithmetic is meaningless here
   *  and must not be recited as if it described the student (#13/#14). */
  planIsEmpty?: boolean;
  /** Injectable "today" (tests); defaults to new Date() in the date handler. */
  now?: Date;
  // Credits
  effectiveTotal: number;
  earned: number;
  planned: number;
  miluimExemption: number;
  mandatory: number;
  elective: number;
  seminar: number;
  focusAreaCredits: number;
  focusAreaTarget: number;
  englishCourseCount: number;
  // Grades
  courseAverage: number | null;
  // Profile / domain
  hasFocusArea: boolean;
  focusAreaNameHe: string | null;
  focusAreaNameEn: string | null;
  currentYear: number;
  /** Year at the PLANNING anchor — for write paths (quick-add). */
  anchorYear?: number;
  /** "male" | "female" | null — for gendered second-person phrasing. */
  gender?: "male" | "female" | null;
  amiramScore: number | null;
  /** #23 — the DECLARED English level (grade sheet); overrides the score. */
  englishLevel?: string | null;
  miluimGroupName: string | null; // localized group name, or null if NONE
  binaryRemaining: number;
  // Requirements
  failedRules: { nameHe: string; nameEn: string; deficit: number }[];
  seminarPlannedCount: number;
  // ── Live plan facts (14.7 W1 — new deterministic handlers) ──
  /** Upcoming exam sittings (future examDateA/B on non-completed courses),
   *  soonest first. Empty = no dates published; NEVER a guessed date. */
  upcomingExams?: { nameHe: string; nameEn: string; date: Date; moed: "A" | "B" }[];
  /** Courses in the LIVE semester (derived year+semester), for "what am I
   *  taking now". */
  currentSemesterCourses?: { nameHe: string; nameEn: string; credits: number }[];
  /** The hardest not-yet-completed course that HAS difficulty data, or null. */
  hardestRemaining?: {
    nameHe: string;
    nameEn: string;
    difficultyLevel: string | null;
    averageGrade: number | null;
    failRate: number | null;
  } | null;
}

export interface QAAnswer {
  text: string;
  href?: string;
  cta?: string;
  /** True when a handler confidently matched the question; false for the
   *  capabilities fallback. The hybrid router reads this to decide whether to
   *  escalate an unanswered question to the LLM. */
  matched?: boolean;
}

type Handler = {
  /** Keywords (lowercased substrings) that trigger this intent. */
  keys: string[];
  answer: (c: QAContext) => QAAnswer;
};

const T = CREDIT_REQUIREMENTS.TOTAL;

function he<T>(c: QAContext, heVal: T, enVal: T): T {
  return c.isHe ? heVal : enVal;
}

/**
 * Gendered Hebrew fragment for second-person phrasing. Unknown gender → the
 * neutral inclusive form (today's copy), so it's always safe to adopt. English
 * has no grammatical gender, so callers just inline the English separately.
 *   `${gm(c, "אתה פטור", "את פטורה", "את/ה פטור/ה")}`
 */
function gm(c: QAContext, male: string, female: string, neutral: string): string {
  return c.gender === "male" ? male : c.gender === "female" ? female : neutral;
}

const HANDLERS: Handler[] = [
  // ── Today's date/time (the "18.7.2024" bug) ───────────────────────
  // Answered deterministically so the LLM can never invent a date.
  {
    keys: ["מה התאריך", "איזה תאריך", "איזה יום היום", "מה היום", "what's the date", "what day is it", "today's date"],
    answer: (c) => {
      const now = c.now ?? new Date();
      const wdHe = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][now.getDay()];
      const wdEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
      const d = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
      return {
        text: he(c, `היום יום ${wdHe}, ${d}.`, `Today is ${wdEn}, ${d}.`),
      };
    },
  },
  // ── Credits remaining ─────────────────────────────────────────────
  {
    // "נקודות זכות" is here on purpose: the bidding handler has a bare
    // "נקודות" key, and without the longer (higher-scoring) key a credits
    // question like "כמה נקודות זכות יש לי" would be hijacked to bidding.
    keys: ["כמה נשאר", "כמה ש", "נשארו לי", "כמה עוד", "נקודות זכות", "credits left", "how many credit", "remaining"],
    answer: (c) => {
      const remaining = Math.max(0, T - c.effectiveTotal);
      return {
        text: he(
          c,
          `נשאר לך להשלים ${remaining} ש״ס מתוך ${T}. כבר יש לך ${c.effectiveTotal} (${c.earned} הושלמו, ${c.planned} מתוכננים${c.miluimExemption > 0 ? `, ${c.miluimExemption} פטור מילואים` : ""}).`,
          `You have ${remaining} of ${T} credits left. You're at ${c.effectiveTotal} (${c.earned} done, ${c.planned} planned${c.miluimExemption > 0 ? `, ${c.miluimExemption} miluim-exempt` : ""}).`
        ),
      };
    },
  },
  // ── What's missing ────────────────────────────────────────────────
  {
    keys: ["מה חסר", "מה נשאר לי לעשות", "מה צריך", "what's missing", "what do i need", "what's left"],
    answer: (c) => {
      if (c.failedRules.length === 0) {
        return {
          text: he(
            c,
            `אין דרישות ${gm(c, "שאתה מפר", "שאת מפרה", "שאת/ה מפר/ה")} כרגע. מה שנשאר זה לצבור את הש״ס שחסרים — ${gm(c, "ראה", "ראי", "ראה/י")} 'המצב שלי' בדשבורד.`,
            "You're not violating any requirement right now. What's left is accumulating the remaining credits — see 'My status' on the dashboard."
          ),
          href: "/regulations",
          cta: he(c, "לפירוט הדרישות", "View requirements"),
        };
      }
      const top = c.failedRules
        .slice()
        .sort((a, b) => b.deficit - a.deficit)
        .slice(0, 3)
        .map((r) => `• ${c.isHe ? r.nameHe : r.nameEn}${r.deficit > 0 ? ` (${r.deficit} ${c.isHe ? "ש״ס" : "cr"})` : ""}`)
        .join("\n");
      return {
        text: he(c, `הדרישות הכי בוערות שחסרות לך:\n${top}`, `Your most pressing missing requirements:\n${top}`),
        href: "/regulations",
        cta: he(c, "לכל הדרישות", "All requirements"),
      };
    },
  },
  // ── How to improve the average ────────────────────────────────────
  {
    keys: [
      "לשפר את הממוצע", "להעלות את הממוצע", "לשפר ממוצע", "לשפר את הציונים",
      "איך לשפר", "improve my average", "raise my average", "improve my grades",
      "how to improve", "boost my average",
    ],
    answer: (c) => {
      const tips: string[] = [];
      // Binary conversion is a miluim lever — only offer it to a reservist
      // (miluimGroupName set). binaryRemaining alone can be the universal BA
      // fallback of 5 for a non-reservist; don't present that as a GPA lever.
      if (c.miluimGroupName && c.binaryRemaining > 0) {
        tips.push(
          he(
            c,
            `• בינארי: נשארו ${c.binaryRemaining} המרות לעובר/לא־עובר — מוציאות ציון-נמוך מהממוצע (הכי כדאי על ציון נמוך-עובר בקורס כבד).`,
            `• Binary: ${c.binaryRemaining} pass/fail conversions left — they take a low grade out of your GPA (best on a low pass in a heavy course).`
          )
        );
      }
      tips.push(
        he(
          c,
          "• קורסים כבדים (יותר ש״ס) שוקלים יותר בממוצע — השקעה בהם מזיזה הכי הרבה.",
          "• Heavier courses (more credits) weigh more — investing there moves the average most."
        )
      );
      tips.push(
        he(
          c,
          "• קורס שנכשלת בו — חזרה עליו מחליפה את הציון ומעלה את הממוצע.",
          "• A failed course — retaking it replaces the grade and lifts your average."
        )
      );
      const head = he(
        c,
        `מנופים לשיפור הממוצע${c.courseAverage !== null ? ` (כרגע ${c.courseAverage.toFixed(1)})` : ""}:`,
        `Levers to lift your average${c.courseAverage !== null ? ` (now ${c.courseAverage.toFixed(1)})` : ""}:`
      );
      return {
        text: `${head}\n${tips.join("\n")}`,
        href: "/graduation",
        cta: he(c, "למחשבון הציונים", "Grade calculator"),
      };
    },
  },
  // ── "אני חושש/לחוץ" (#active-ai) — empathy grounded in real numbers ──
  // The deterministic fallback when no LLM key exists; with a key the router
  // escalates (the markers include these words) so the persona answers with
  // heart. Either way: acknowledge → real status → ONE concrete step.
  {
    keys: ["חושש", "חוששת", "מפחד", "מפחדת", "לחוצ", "נלחצ", "מודאג", "מודאגת", "קשה לי", "worried", "anxious", "scared", "stressed"],
    answer: (c) => {
      const gaps = c.failedRules.length;
      const heGaps =
        gaps === 0
          ? "ולפי הנתונים — אין כרגע אף דרישה שנשברה. המצב טוב יותר ממה שזה מרגיש."
          : `בפועל יש ${gaps === 1 ? "דרישה אחת פתוחה" : `${gaps} דרישות פתוחות`}, וכולן ניתנות לסגירה בתכנון נכון.`;
      const enGaps =
        gaps === 0
          ? "and per your data, nothing is currently broken. It's better than it feels."
          : `there ${gaps === 1 ? "is one open requirement" : `are ${gaps} open requirements`}, all closable with planning.`;
      return {
        text: he(
          c,
          `זה בסדר גמור להילחץ — תואר של 150 ש״ס עושה את זה לכולם. ${heGaps} ${gm(c, "ספר", "ספרי", "ספרו")} לי ממה בדיוק — מבחן מסוים? עומס? ממוצע? — ואפרק את זה איתך לצעדים.`,
          `It's completely fine to feel stressed — a 150-credit degree does that to everyone. ${enGaps} Tell me what exactly worries you — an exam? load? the average? — and we'll break it into steps.`,
        ),
        href: "/regulations",
        cta: he(c, "לבדיקת המסלול", "Degree check"),
      };
    },
  },
  // ── Grade of a SPECIFIC course (מבחן-המלך #14) ────────────────────
  // The aggregate QAContext has no per-course grades, so the honest answer
  // is a precise redirect to the record — NOT the overall average (which is
  // what a bare "ציון" match used to fall into). Longer keys out-score the
  // average handler's "הציון שלי"/"ממוצע" under the length-weighted matcher.
  // A course-SCOPED average ("ממוצע בקורס X") is the same honest case — a single
  // course has a grade, not an average — so it lands here. NOTE: we deliberately
  // do NOT key the bare prefixes "הממוצע שלי ב" / "average in" here: Hebrew ‏ב‏ is a
  // one-letter preposition that glues to the next word, so those matched — and
  // wrongly deflected — legit OVERALL-average questions ("הממוצע שלי בתואר",
  // "average in the degree"). Only unambiguously course-scoped keys stay
  // (ממוצע בקורס / ממוצע של הקורס / average for the course). The common
  // honest-grade phrasing "הציון שלי ב<קורס>" is kept and still routes here.
  {
    keys: ["הציון שלי ב", "ציון בקורס", "ציון של הקורס", "אין לי ציון", "עוד אין ציון", "ממוצע בקורס", "ממוצע של הקורס", "my grade in", "grade for", "grade in the course", "average for the course"],
    answer: (c) => ({
      text: he(
        c,
        "ציון של קורס בודד רואים בתיק האקדמי — כל קורס עם הציון שלו. אם לקורס עדיין אין ציון (למשל קורס שרץ עכשיו), הוא יופיע שם ברגע שיפורסם — אני לא מנחש ציונים.",
        "A single course's grade lives in your academic record — every course with its grade. If a course has no grade yet (e.g. still running), it'll appear there once published — I don't guess grades.",
      ),
      href: "/record",
      cta: he(c, "לתיק האקדמי", "My record"),
    }),
  },
  // ── Average / GPA ─────────────────────────────────────────────────
  {
    keys: ["ממוצע", "הציון שלי", "gpa", "average", "my grade"],
    answer: (c) => {
      if (c.courseAverage === null) {
        return {
          text: he(c, `עדיין אין לך ציונים שמורים. ${gm(c, "הזן", "הזני", "הזן/י")} ציונים במחשבון הציונים ואראה לך את הממוצע.`, "No grades recorded yet. Enter grades in the calculator and I'll show your average."),
          href: "/graduation",
          cta: he(c, "למחשבון הציונים", "Grade calculator"),
        };
      }
      const bar = GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA;
      const note =
        c.courseAverage >= bar
          ? he(c, `מעל סף מעבר השנה (${bar}).`, `above the ${bar} year-transition bar.`)
          : he(c, `מתחת לסף מעבר השנה (${bar}) — שווה לכוון גבוה בקורסים הקרובים.`, `below the ${bar} bar — aim high on upcoming courses.`);
      return {
        text: he(c, `הממוצע הכללי שלך הוא ${c.courseAverage.toFixed(1)} — ${note}`, `Your overall average is ${c.courseAverage.toFixed(1)} — ${note}`),
      };
    },
  },
  // ── Binary ────────────────────────────────────────────────────────
  {
    keys: ["בינארי", "עובר לא עובר", "עובר/לא", "pass/fail", "pass fail", "binary"],
    answer: (c) => {
      const base = he(
        c,
        'המרה בינארית הופכת ציון מספרי ל"עובר" — הקורס עדיין נספר לתואר, אבל הציון יוצא מהממוצע. מתי זה משתלם? כשעברת קורס כבד בציון שמושך את הממוצע למטה. ומתי לא? שלושה דברים ששווה לשקול: הצטיינות (המרה של יותר מ-25% משעות-השנה פוסלת דקאן/רקטור), קורסי-ליבה כמו מיקרו וסטטיסטיקה (מעסיקים ותארים מתקדמים מסתכלים דווקא עליהם — לפעמים 78 מספרי שווה יותר מ"עובר"), וזה שההמרה בדרך-כלל בלתי-הפיכה.',
        "A binary conversion turns a numeric grade into a pass — the course still counts for the degree, but the grade leaves your average. Worth it when a heavy course dragged your average down. Think twice about: honors (converting >25% of a year's hours forfeits dean's/rector's honors), core courses like micro and statistics (employers and grad schools look at exactly those — a numeric 78 can be worth more than a Pass), and the conversion usually being irreversible."
      );
      const quota = c.miluimGroupName
        ? he(c, ` נשארו לך ${c.binaryRemaining} מתוך 5 המרות. כשמחליטים — מסמנים את הקורס בתיק האקדמי, ואת ההמרה עצמה מבצעים מול מזכירות החוג.`, ` You have ${c.binaryRemaining} of 5 conversions left. When you decide — mark the course in your record; the conversion itself is done with the department office.`)
        : he(c, " (ההטבה זמינה לזכאי מילואים בלבד.)", " (Available to miluim-eligible students only.)");
      return { text: base + quota, href: "/record", cta: he(c, "לתיק האקדמי", "Open record") };
    },
  },
  // ── Electives ─────────────────────────────────────────────────────
  {
    keys: ["בחירה", "קורסי בחירה", "elective"],
    answer: (c) => {
      const left = Math.max(0, CREDIT_REQUIREMENTS.ELECTIVE_TOTAL - c.elective);
      return {
        text: he(
          c,
          `קורסי בחירה: יש לך ${c.elective} מתוך ${CREDIT_REQUIREMENTS.ELECTIVE_TOTAL} ש״ס${left > 0 ? `, נשארו ${left}` : " — הושלם ✓"}.`,
          `Electives: you have ${c.elective} of ${CREDIT_REQUIREMENTS.ELECTIVE_TOTAL} credits${left > 0 ? `, ${left} to go` : " — done ✓"}.`
        ),
        href: "/catalog",
        cta: he(c, "לקטלוג", "Catalog"),
      };
    },
  },
  // ── Mandatory credits (mirror of electives) ───────────────────────
  {
    keys: ["קורסי חובה", "כמה חובה", "חובה נשאר", "חובה", "mandatory", "required credits"],
    answer: (c) => {
      const left = Math.max(0, CREDIT_REQUIREMENTS.MANDATORY_TOTAL - c.mandatory);
      return {
        text: he(
          c,
          `קורסי חובה: יש לך ${c.mandatory} מתוך ${CREDIT_REQUIREMENTS.MANDATORY_TOTAL} ש״ס${left > 0 ? `, נשארו ${left}` : " — הושלם ✓"}.`,
          `Mandatory: you have ${c.mandatory} of ${CREDIT_REQUIREMENTS.MANDATORY_TOTAL} credits${left > 0 ? `, ${left} to go` : " — done ✓"}.`
        ),
        href: "/planner",
        cta: he(c, "לתכנון", "Plan"),
      };
    },
  },
  // ── Moed B / retake ───────────────────────────────────────────────
  {
    keys: ["מועד ב", "מועד ב׳", "מועד חוזר", "מבחן חוזר", "moed b", "retake", "second sitting"],
    answer: (c) => ({
      text: he(
        c,
        `מועד ב׳ = הזדמנות שנייה למבחן. ${gm(c, "שים לב", "שימי לב", "שימו לב")}: בת״א הציון האחרון קובע (לא הגבוה) — אז כדאי ללכת רק אם ${gm(c, "אתה בטוח שתשתפר", "את בטוחה שתשתפרי", "בטוחים שתשתפרו")}.${c.miluimGroupName ? " למילואימניקים בקבוצת-הטבה (B/C/G) יש זכות לגשת ל-2 מתוך 3 מועדים, והגבוה מביניהם נשמר — הפירוט בעמוד המילואים." : ""} שיבוץ הלמידה, פריסה אחורה מכל מבחן ואיזון עומס — במתכנן המבחנים.`,
        `Moed B is a second exam sitting. Note: at TAU the LAST grade counts (not the higher one) — so retake only if you're confident you'll improve.${c.miluimGroupName ? " Reservists in a benefit group (B/C/G) may sit 2 of 3 dates with the higher grade kept — see the miluim page." : ""} Study spread, reverse-planning and load balancing are in the exam planner.`
      ),
      href: "/exam-planner",
      cta: he(c, "למתכנן המבחנים", "Exam planner"),
    }),
  },
  // ── Next exam(s) — real dates only, never invented (14.7 W1) ───────
  {
    keys: ["מתי המבחן", "המבחן הקרוב", "המבחן הבא", "אילו מבחנים", "מתי הבחינה", "הבחינה הקרובה", "מבחנים קרובים", "next exam", "upcoming exam", "when is my exam"],
    answer: (c) => {
      const now = c.now ?? new Date();
      // Future-only filter lives HERE (pure, at answer time), not in the React
      // context builder where Date.now() is impure-during-render (14.7 W1).
      //
      // The test is a CIVIL-DAY one, not a raw-ms one. Exam dates are stored at
      // UTC midnight; a raw `e.date >= now` therefore declared today's exam PAST
      // from 02:00 Israel onward — and with one exam left the King fell through
      // to "אין כרגע תאריכי-מבחן שפורסמו", a false statement about the
      // university, contradicting the dashboard countdown showing "היום" on the
      // same screen. Same fix days-until.ts already carries; identical shape so
      // the two can never diverge again.
      // Now the SAME CALL days-until.ts makes, not a re-spelling of it: `now`
      // was still bucketed by its UTC components here, which is a different
      // "today" from israelDayKeyMs for the first hours of every Israeli day —
      // the exact divergence the comment above claimed did not exist (deferred-2).
      const todayUTC = israelDayKeyMs(now);
      const civilDay = (d: Date) => storedDateKeyMs(d);
      const list = (c.upcomingExams ?? []).filter((e) => civilDay(e.date) >= todayUTC);
      if (list.length === 0) {
        return {
          text: he(
            c,
            "אין כרגע תאריכי-מבחן שפורסמו לקורסים שלך — ואני לא ממציא תאריכים. ברגע שת״א תפרסם, הם יופיעו כאן ובמתכנן המבחנים.",
            "No published exam dates for your courses yet — and I don't invent dates. Once TAU publishes them they'll show here and in the exam planner.",
          ),
          href: "/exam-planner",
          cta: he(c, "למתכנן המבחנים", "Exam planner"),
        };
      }
      // Civil days too — a raw-ms Math.round labelled TOMORROW's exam "היום"
      // from ~13:00 Israel onward (11h away rounds to 0 days).
      const daysTo = (d: Date) => Math.max(0, Math.round((civilDay(d) - todayUTC) / 86_400_000));
      const whenHe = (d: Date) => { const n = daysTo(d); return n === 0 ? "היום" : n === 1 ? "מחר" : `בעוד ${n} ימים`; };
      const top = list.slice(0, 3);
      const linesHe = top.map((e) => `• ${e.nameHe} (מועד ${e.moed === "B" ? "ב׳" : "א׳"}) — ${whenHe(e.date)}`);
      // daysUntilLabel keeps "today"/"in 1 day" grammatical — "in 0 days" was
      // both wrong-looking and, on the exam morning, wrong.
      const linesEn = top.map((e) => `• ${e.nameEn} (Moed ${e.moed}) — ${daysUntilLabel(daysTo(e.date), false)}`);
      return {
        text: he(
          c,
          `${list.length === 1 ? "המבחן הקרוב שלך" : `${top.length} המבחנים הקרובים שלך`}:\n${linesHe.join("\n")}`,
          `${list.length === 1 ? "Your next exam" : `Your next ${top.length} exams`}:\n${linesEn.join("\n")}`,
        ),
        href: "/exam-planner",
        cta: he(c, "לתכנון תקופת המבחנים", "Plan the exam period"),
      };
    },
  },
  // ── This semester's courses (14.7 W1) ─────────────────────────────
  {
    keys: ["כמה קורסים אני לוקח", "מה אני לומד הסמסטר", "אילו קורסים יש לי הסמסטר", "הקורסים שלי הסמסטר", "מה יש לי הסמסטר", "courses this semester", "what am i taking"],
    answer: (c) => {
      const list = c.currentSemesterCourses ?? [];
      if (list.length === 0) {
        return {
          text: he(
            c,
            "לא רשומים לך קורסים בסמסטר הנוכחי בתוכנית. אפשר להוסיף אותם במתכנן התואר.",
            "No courses in your plan for the current semester. Add them in the degree planner.",
          ),
          href: "/planner",
          cta: he(c, "לתכנון התואר", "Degree planner"),
        };
      }
      const credits = list.reduce((s, x) => s + x.credits, 0);
      const namesHe = list.map((x) => x.nameHe).join(", ");
      const namesEn = list.map((x) => x.nameEn).join(", ");
      return {
        text: he(
          c,
          `הסמסטר יש לך ${list.length} קורסים, ${credits} ש״ס: ${namesHe}.`,
          `This semester you have ${list.length} courses, ${credits} credits: ${namesEn}.`,
        ),
        href: "/planner",
        cta: he(c, "לתכנון התואר", "Degree planner"),
      };
    },
  },
  // ── Hardest remaining course — sourced, or honest "no data" (14.7 W1) ─
  {
    keys: ["הכי קשה", "קורס קשה שנשאר", "הקורס הקשה", "מה הכי קשה", "hardest course", "toughest course"],
    answer: (c) => {
      const h = c.hardestRemaining;
      if (!h) {
        return {
          text: he(
            c,
            "אין לי נתוני-קושי לקורסים שנשארו לך — אז אני לא מדרג בלי נתונים. בקטלוג יש ממוצע ואחוז-כישלון היכן שנאספו.",
            "I don't have difficulty data for your remaining courses — so I won't rank without it. The catalog shows average and fail-rate where collected.",
          ),
          href: "/catalog",
          cta: he(c, "לקטלוג", "Catalog"),
        };
      }
      const bits: string[] = [];
      if (h.averageGrade != null) bits.push(he(c, `ממוצע ${h.averageGrade}`, `avg ${h.averageGrade}`));
      // Course.failRate is stored as a PERCENTAGE 0-100 (schema.prisma:184,
      // enricher computeFailRate = failCount/total*100) — every catalog display
      // renders it as `${Math.round(failRate)}%`. Do NOT ×100 here (that printed
      // an impossible "2250% כישלון" — a fabricated number, cardinal-sin bug).
      if (h.failRate != null) bits.push(he(c, `${Math.round(h.failRate)}% כישלון`, `${Math.round(h.failRate)}% fail`));
      const src = bits.length ? ` (לפי נתוני-הציונים בקטלוג: ${bits.join(", ")})` : "";
      const srcEn = bits.length ? ` (per catalog grade data: ${bits.join(", ")})` : "";
      return {
        text: he(
          c,
          `מבין הקורסים שנשארו לך, הכי מאתגר לפי הנתונים הוא ${h.nameHe}${src}. שווה לתת לו מקום נפרד בתכנון הלמידה.`,
          `Of your remaining courses, the toughest by the data is ${h.nameEn}${srcEn}. Worth giving it its own space in your study plan.`,
        ),
        href: "/exam-planner",
        cta: he(c, "למתכנן המבחנים", "Exam planner"),
      };
    },
  },
  // ── Final-grade formula ───────────────────────────────────────────
  {
    keys: ["ציון גמר", "ציון הגמר", "ציון סופי", "איך מחשבים ציון", "מחשבים את ציון", "שקלול", "final grade", "grade formula", "how is my grade"],
    answer: (c) => {
      const formula = he(
        c,
        `ציון הגמר משוקלל: ${Math.round(GRADE_WEIGHTS.COURSES * 100)}% ממוצע קורסי חובה+בחירה, ${Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}% מ-${SEMINAR_REQUIREMENTS.PAPERS} עבודות סמינריוניות, ו-${Math.round(GRADE_WEIGHTS.REFERAT * 100)}% רפרט.`,
        `Your final grade is weighted: ${Math.round(GRADE_WEIGHTS.COURSES * 100)}% course average, ${Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}% from ${SEMINAR_REQUIREMENTS.PAPERS} seminar papers, and ${Math.round(GRADE_WEIGHTS.REFERAT * 100)}% referat.`,
      );
      // Honesty (מבחן-המלך #12): with no graded seminar/referat yet, a projected
      // final grade would be mostly guesswork — say so before the formula.
      const noSeminarYet = c.seminar === 0;
      const prefix = noSeminarYet
        ? he(
            c,
            "עדיין אי-אפשר לחשב ציון-גמר צפוי — אין עדיין עבודה סמינריונית או רפרט עם ציון. אבל ככה הוא ישוקלל בסוף: ",
            "A projected final grade isn't possible yet — no seminar paper or referat has a grade. Here's how it will be weighted, though: ",
          )
        : "";
      return {
        text: `${prefix}${formula}`,
        href: "/graduation",
        cta: he(c, "לצפי הגמר", "Graduation"),
      };
    },
  },
  // ── English / Amiram ──────────────────────────────────────────────
  {
    keys: ["אנגלית", "אמירם", "אמירנט", "english", "amiram"],
    answer: (c) => {
      // #23 — the declared level (grade sheet) wins over the score; only
      // claim "לפי האמירנט" when the score is actually the source.
      const lvl = resolveEnglishLevel(c.englishLevel, c.amiramScore);
      const declared = resolveEnglishLevel(c.englishLevel, null) != null;
      const content = he(
        c,
        `דרישת-התוכן: ${CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} קורסים אקדמיים שנלמדים באנגלית (חובה לכולם, בלי קשר לרמה) — השלמת ${c.englishCourseCount} מתוכם.`,
        `Content requirement: ${CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} courses taught in English (everyone needs these, regardless of level) — you've completed ${c.englishCourseCount}.`
      );
      if (!lvl) {
        return {
          text: he(c, `${content} אין רמת-אנגלית בפרופיל — ${gm(c, "הוסף", "הוסיפי", "הוסיפו")} ציון אמירנט בהגדרות (או ${gm(c, "סרוק", "סרקי", "סרקו")} גיליון ציונים והרמה תיקלט לבד) כדי לדעת אם יש פטור או קורסי רמה.`, `${content} No English level on your profile — add an Amiram score in settings (or scan your grade sheet and the level is picked up) to see if you're exempt or owe level courses.`),
          href: "/settings",
          cta: he(c, "להגדרות", "Settings"),
        };
      }
      // Year-gate the LEVEL-course advice: the exemption deadline is end of
      // year 1, so a year-2+ student shouldn't be told to take level courses —
      // they should already be exempt (#11). The CONTENT courses still stand.
      const lvlTxt = lvl.isExempt
        ? he(c, `${gm(c, "אתה פטור", "את פטורה", "את/ה פטור/ה")} מקורסי רמה (${declared ? "לפי הרמה מהגיליון" : `אמירנט ${c.amiramScore}`}).`, `You're exempt from level courses (${declared ? "per your declared level" : `Amiram ${c.amiramScore}`}).`)
        : c.currentYear <= 1
          ? he(c, `דרישת-הרמה: ${declared ? "לפי הרמה מהגיליון" : `לפי האמירנט (${c.amiramScore})`} ${gm(c, "אתה", "את", "את/ה")} ברמת ${lvl.nameHe}, כלומר ${lvl.levelCourses === 1 ? "נשאר קורס-אנגלית אחד" : `נשארו ${lvl.levelCourses} קורסי-אנגלית`} עד הפטור. לפי התקנון מגיעים לפטור (134+) עד סוף שנה א׳.`, `Level requirement: ${declared ? "per your declared level" : `per your Amiram (${c.amiramScore})`} you're at ${lvl.nameEn} — ${lvl.levelCourses === 1 ? "one level course left" : `${lvl.levelCourses} level courses left`} to exemption. Regulations expect exemption (134+) by the end of Year 1.`)
          : he(c, `${gm(c, "אתה", "את", "את/ה")} ב${lvl.nameHe} (${declared ? "לפי הגיליון" : `אמירנט ${c.amiramScore}`}), אבל הדדליין לפטור היה סוף שנה א׳ — אם עדיין אין לך פטור, ${gm(c, "פנה", "פני", "פנה/י")} לייעוץ אקדמי (קורסי-התוכן באנגלית עדיין נדרשים).`, `You're at ${lvl.nameEn} (${declared ? "per your sheet" : `Amiram ${c.amiramScore}`}), but the exemption deadline was the end of Year 1 — if you're still not exempt, see academic advising (the English content courses are still required).`);
      // #36 (owner-verified 4.7): English grades do NOT count toward the PPE
      // degree average — Ariel confirmed against a real transcript. (Earlier
      // research had inferred the opposite; the owner's check overrides it.)
      const avgNote = lvl.isExempt
        ? he(c, "כפטור — אין לך ציון-אנגלית, ואנגלית לא משפיעה על הממוצע.", "As exempt, you have no English grade, and English doesn't affect your average.")
        : he(c, "טוב לדעת: ציון קורסי-האנגלית אינו נכנס לממוצע התואר.", "Good to know: your English course grades don't count toward the degree average.");
      return { text: `${content} ${lvlTxt} ${avgNote}` };
    },
  },
  // ── Miluim ────────────────────────────────────────────────────────
  {
    keys: ["מילואים", "הטבות", "פטור מילואים", "miluim", "reserve", "miluim exemption"],
    answer: (c) => {
      if (!c.miluimGroupName) {
        return { text: he(c, `לא רשום אצלנו שירות מילואים. אם ${gm(c, "שירתת", "שירתת", "שירתם")} — עדכנו בעמוד המילואים כדי לקבל את ההטבות (פטור ש״ס, בחירת מועדים, בינארי ועוד).`, "No miluim service set. If you served, update it on the Miluim page to unlock benefits (credit exemption, exam-date choice, binary, and more."), href: "/miluim", cta: he(c, "לעמוד המילואים", "Miluim page") };
      }
      // Build the entitlements as a natural clause, skipping any that are zero
      // so we never say "0 credits". Reads like a sentence, not a data dump (#37).
      const perks: string[] = [];
      if (c.miluimExemption > 0) {
        perks.push(he(c, `${c.miluimExemption} ש״ס פטור`, `${c.miluimExemption} exempt credits`));
      }
      if (c.binaryRemaining > 0) {
        perks.push(he(c, `${c.binaryRemaining} המרות לבינארי`, `${c.binaryRemaining} binary conversions`));
      }
      const perksClause = perks.length
        ? he(c, ` מגיע לך ${perks.join(" ו-")}.`, ` You're entitled to ${perks.join(" and ")}.`)
        : "";
      return {
        text: he(
          c,
          `השירות שלך מסווג ב${c.miluimGroupName}.${perksClause} לפירוט המלא פִּתחו את "ההטבות שלי" בפס המילואים למעלה.`,
          `Your service is classified as ${c.miluimGroupName}.${perksClause} Open "My benefits" in the miluim bar above for the full breakdown.`
        ),
      };
    },
  },
  // ── Seminars ──────────────────────────────────────────────────────
  {
    keys: ["סמינר", "סמינריון", "seminar"],
    answer: (c) => {
      const left = Math.max(0, CREDIT_REQUIREMENTS.SEMINAR_TOTAL - c.seminar);
      const planNote =
        c.seminarPlannedCount === 0
          ? he(c, " עדיין לא שיבצת סמינר — שווה לתכנן מוקדם כי המקומות הפופולריים נגמרים.", " You haven't planned a seminar yet — plan early, popular ones fill up.")
          : "";
      return {
        text: he(
          c,
          `סמינרים: ${c.seminar} מתוך ${CREDIT_REQUIREMENTS.SEMINAR_TOTAL} ש״ס${left > 0 ? `, נשארו ${left}` : " ✓"}. ${SEMINAR_REQUIREMENTS.PAPERS} עבודות סמינריוניות = ${Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}% מציון הגמר.${planNote}`,
          `Seminars: ${c.seminar} of ${CREDIT_REQUIREMENTS.SEMINAR_TOTAL} credits${left > 0 ? `, ${left} to go` : " ✓"}. ${SEMINAR_REQUIREMENTS.PAPERS} seminar papers are ${Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}% of the final grade.${planNote}`
        ),
        href: "/planner",
        cta: he(c, "לתכנון", "Plan"),
      };
    },
  },
  // ── Year transition ───────────────────────────────────────────────
  // #22 (13.8): the old answer printed "הממוצע הכללי שלך כרגע: —" when no grades
  // were recorded. An em-dash where a number belongs is a dead end — it reads as
  // a broken field, not as an answer. A missing number is itself information:
  // say plainly that nothing is recorded yet, and hand over the next step.
  {
    // "לשנה הבאה" was a key here and it was too generic: the matcher is
    // length-weighted, so "מתי נפתח מקצה הבידינג הראשון לשנה הבאה?" scored
    // this handler ABOVE the bidding one (9 chars vs 6) and answered with the
    // 75/80 year-transition rule — making the תשפ״ז bidding dates unreachable
    // by the most natural way to ask for them (live QA, 13.8). The remaining
    // keys all name the transition explicitly.
    keys: ["מעבר שנה", "לעבור שנה", "תנאי מעבר", "תנאי המעבר", "מעבר לשנה", "advance a year", "year transition"],
    answer: (c) => {
      const overall = GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA;
      const ppe = GRADE_REQUIREMENTS.YEAR_TRANSITION_PPE_GPA;
      const ruleHe = `כדי לעבור שנה צריך ממוצע כללי ${overall} לפחות, וממוצע ${ppe} בקורסי הפכ״מ.`;
      const ruleEn = `To advance a year you need an overall average of at least ${overall}, and ${ppe} in PPE courses.`;
      if (c.courseAverage === null) {
        return {
          text: he(
            c,
            `${ruleHe} אצלך עוד לא שמורים ציונים, אז אין לי ממוצע להעמיד מול הסף — ${gm(c, "הזן", "הזני", "הזן/י")} את הציונים שכבר קיבלת ואומר לך בדיוק איפה ${gm(c, "אתה עומד", "את עומדת", "את/ה עומד/ת")}.`,
            `${ruleEn} You have no grades recorded yet, so there's no average to hold against the bar — add the grades you already have and I'll tell you exactly where you stand.`
          ),
          href: "/graduation",
          cta: he(c, "למחשבון הציונים", "Grade calculator"),
        };
      }
      const avg = c.courseAverage.toFixed(1);
      const standing =
        c.courseAverage >= overall
          ? he(c, `זה מעל הסף הכללי — ${gm(c, "אתה בסדר", "את בסדר", "את/ה בסדר")} מהבחינה הזו.`, "That's above the overall bar — you're fine on that count.")
          : he(c, "זה מתחת לסף הכללי — שווה לכוון גבוה בקורסים הקרובים.", "That's below the overall bar — worth aiming high in the coming courses.");
      return {
        text: he(
          c,
          `${ruleHe} הממוצע הכללי שלך כרגע ${avg}. ${standing}`,
          `${ruleEn} Your overall average is ${avg}. ${standing}`
        ),
      };
    },
  },
  // ── Focus area ────────────────────────────────────────────────────
  {
    keys: ["התמחות", "תחום מיקוד", "מיקוד", "focus", "specialization"],
    answer: (c) => {
      if (!c.hasFocusArea) {
        return {
          text: he(
            c,
            `תחום המיקוד הוא ${c.focusAreaTarget} ש״ס באחת משלוש הדיסציפלינות, והיא גם קובעת את הסיווג בשירות-המדינה:\n• פילוסופיה — חשיבה, אתיקה, לוגיקה ותורת-המדע.\n• כלכלה — הדיסציפלינה הכמותית ביותר: מודלים, נתונים ומדיניות.\n• מדע המדינה — ממשל, יחסים בין-לאומיים ומדיניות ציבורית.\nאיך בוחרים: לפי מה שהכי מסקרן אותך ללמוד לעומק (${c.focusAreaTarget} ש״ס זה הרבה) ולפי הכיוון שתרצה להתקדם אליו. שווה לעיין בקטלוג ולראות אילו קורסים מדברים אליך — בוחרים בהגדרות, ואפשר לשנות בהמשך.`,
            `Your focus is ${c.focusAreaTarget} credits in one of three disciplines, and it also sets your civil-service track:\n• Philosophy — reasoning, ethics, logic, philosophy of science.\n• Economics — the most quantitative track: models, data, policy.\n• Political Science — government, international relations, public policy.\nHow to choose: by what you'd most want to study in depth (${c.focusAreaTarget} credits is a lot) and the direction you want to head. Browse the catalog to see which courses speak to you — you choose in settings and can change it later.`
          ),
          href: "/catalog",
          cta: he(c, "עיין בקורסים לפי תחום", "Browse courses by discipline"),
        };
      }
      const name = c.isHe ? c.focusAreaNameHe : c.focusAreaNameEn;
      const left = Math.max(0, c.focusAreaTarget - c.focusAreaCredits);
      return {
        text: he(
          c,
          `תחום מיקוד: ${name ?? ""} — ${c.focusAreaCredits} מתוך ${c.focusAreaTarget} ש״ס${left > 0 ? `, נשארו ${left}` : " ✓"}.`,
          `Focus: ${name ?? ""} — ${c.focusAreaCredits} of ${c.focusAreaTarget} credits${left > 0 ? `, ${left} to go` : " ✓"}.`
        ),
      };
    },
  },
  // ── Honors ────────────────────────────────────────────────────────
  {
    keys: ["הצטיינות", "מצטיין", "דקאן", "רקטור", "honors", "dean", "rector"],
    answer: (c) =>
      ({
        text: he(
          c,
          `הצטיינות (דקאן/רקטור) במדעי הרוח דורשת בערך ממוצע שנתי משוקלל 95 ומעלה (משתנה משנה לשנה, בערך 3% העליונים). חשוב: שימוש כבד בבינארי (מעל 25% מהשעות) פוסל הצטיינות.`,
          `Honors (dean's/rector's) in Humanities needs roughly a 95+ annual weighted average (drifts yearly, top ~3%). Note: heavy binary use (>25% of hours) disqualifies honors.`
        ),
      }),
  },
  // ── Bidding ───────────────────────────────────────────────────────
  {
    keys: ["בידינג", "מכרז", "נקודות", "bidding", "registration points"],
    answer: (c) =>
      ({
        text: he(
          c,
          `בידינג = מכרז: המציע הגבוה זוכה (לא כל-הקודם-זוכה). 2 מקצים, הנקודות מתאפסות בכל מקצה, מינ׳ 5 לקורס, והרצאה+תרגיל ביחד. חפיפת שעות בתוך אותו מקצה נפתרת לפי הניקוד הגבוה (הקורס השני מפסיד והנקודות עוברות הלאה); רק במקצה השני קורס חופף מבטל שיבוץ שכבר קיבלתם במקצה הראשון. ${gm(c, "ראה", "ראי", "ראו")} את המסביר המלא במתכנן.`,
          "Bidding is an auction: highest bidder wins (not first-come). 2 rounds, points reset each round, min 5 per course, lecture+tutorial together. The trap: registering for a time-overlapping course cancels the earlier one! See the full explainer in the planner."
        ),
        href: "/planner",
        cta: he(c, "למסביר הבידינג", "Bidding explainer"),
      }),
  },
  // ── Graduation forecast: when will I finish ───────────────────────
  {
    keys: [
      "מתי אסיים", "מתי אני מסיים", "מתי אגמור", "מתי אני גומר", "כמה זמן נשאר",
      "מתי אסיים את התואר", "when do i graduate", "when will i finish", "how much longer",
      "how long until",
    ],
    answer: (c) => {
      const remaining = Math.max(0, T - c.effectiveTotal);
      if (remaining === 0) {
        return {
          text: he(
            c,
            `השלמת את כל הש״ס לתואר. נשאר רק לוודא שכל הדרישות מולאו — ${gm(c, "ראה", "ראי", "ראו")} את ׳המצב שלי׳.`,
            "You've completed all degree credits. Just confirm every requirement is met — see 'My status'."
          ),
          href: "/regulations",
          cta: he(c, "בדיקת דרישות", "Check requirements"),
        };
      }
      const sems = Math.max(1, Math.ceil(remaining / 25));
      return {
        text: he(
          c,
          `נשארו לך ${remaining} ש״ס — בקצב רגיל (~25 לסמסטר) זה עוד כ-${sems} סמסטרים, תלוי בעומס שתיקח.`,
          `You have ${remaining} credits left — at a normal pace (~25/semester) that's about ${sems} more semesters, depending on your load.`
        ),
        href: "/planner/semester",
        cta: he(c, "לתכנון", "Plan"),
      };
    },
  },
  // ── Pace ──────────────────────────────────────────────────────────
  {
    keys: ["כמה לסמסטר", "קצב", "per semester", "pace"],
    answer: (c) =>
      ({
        text: he(
          c,
          `${T} ש״ס ב-3 שנים = בערך 25 ש״ס לסמסטר. נשאר לך ${Math.max(0, T - c.effectiveTotal)} ש״ס — חלק אותם על הסמסטרים שנותרו ותראה אם הקצב סביר.`,
          `${T} credits over 3 years ≈ 25 per semester. You have ${Math.max(0, T - c.effectiveTotal)} left — spread them over your remaining semesters to gauge the pace.`
        ),
      }),
  },
];

// -------------------------------------------------------------------
// #22 — social talk ("ומה שלומך?")
// -------------------------------------------------------------------
// Ariel's transcript: a friendly question got the boundary line ("זה כל מה
// שרלוונטי כאן"). With an AI key that's a prompt problem (fixed in
// mentor-prompt); WITHOUT a key the free engine was even colder — it fell to
// "לא בטוח שהבנתי" + a capabilities list. Warmth must not cost honesty, so
// this stays a fixed, data-free pleasantry that hands the turn straight back
// to the degree — and the router still escalates it, so a keyed student hears
// the persona's own voice instead of this fallback.
//
// Matched on the WHOLE normalized question only. That is the guard against the
// false-positive class that once let a bare keyword hijack a real question:
// "מה קורה אם אני נכשל בקורס?" is not "מה קורה?".

export type SocialTalkKind = "greeting" | "thanks";

const GREETINGS = new Set([
  "מה שלומכ", "מה שלומכמ", "מה נשמע", "מה קורה", "מה המצב", "מה חדש",
  "בוקר טוב", "ערב טוב", "צהריימ טובימ", "לילה טוב", "שבוע טוב", "שלומ", "שלומ לכ",
  "היי", "הי", "הלו", "אהלנ", "יו",
  "how are you", "how are you doing", "hows it going", "how is it going",
  "whats up", "sup", "good morning", "good evening", "good afternoon",
  "hi", "hello", "hey", "yo",
]);

const THANKS = new Set([
  "תודה", "תודה רבה", "תודה לכ", "מעולה", "מגניב", "אהבתי", "כל הכבוד", "יפה", "סבבה",
  "thanks", "thank you", "thanks a lot", "great", "nice", "awesome", "cool", "love it",
]);

/**
 * Is this whole message just social talk? Returns the kind, or null.
 * Exported so the hybrid router can escalate it to the persona when a key
 * exists (the same shape as the empathy handler).
 */
export function socialTalkKind(question: string): SocialTalkKind | null {
  // A leading "ו"/"אז" is conversational glue, not content ("ומה שלומך?").
  const q = normalize(question).replace(/^אז /, "").replace(/^ו(?=[א-ת])/, "");
  if (!q) return null;
  if (GREETINGS.has(q)) return "greeting";
  if (THANKS.has(q)) return "thanks";
  return null;
}

function socialAnswer(kind: SocialTalkKind, c: QAContext): QAAnswer {
  if (kind === "thanks") {
    return {
      text: he(
        c,
        `בשמחה — בשביל זה אני כאן. ${gm(c, "תגיד", "תגידי", "תגידו")} לי מה הלאה: הסמסטר הקרוב, הש״ס שנשארו, או הציונים?`,
        "My pleasure — that's what I'm here for. What's next: the coming semester, the credits left, or your grades?"
      ),
    };
  }
  return {
    text: he(
      c,
      `טוב, תודה ששאלת — ואני כאן ומוכן. מה מעסיק ${gm(c, "אותך", "אותך", "אתכם")} עכשיו: הסמסטר הקרוב, הש״ס שנשארו, או הציונים?`,
      "Good, thanks for asking — and I'm here and ready. What's on your mind: the coming semester, the credits left, or your grades?"
    ),
  };
}

/** The capabilities shown when no intent matches (and as starter chips). */
export function suggestedQuestions(isHe: boolean): string[] {
  return isHe
    ? [
        "כמה ש״ס נשארו לי?",
        "מה חסר לי לתואר?",
        "מה הממוצע שלי?",
        "איזה תחום מיקוד לבחור?",
        "כמה סמינרים צריך?",
        "מה תנאי מעבר שנה?",
        "יש לי סיכוי להצטיינות?",
        "מה הסטטוס שלי באנגלית?",
        "מה זה בינארי?",
        "מה ההטבות שלי במילואים?",
        "איך עובד הבידינג?",
        "מתי כדאי ללכת למועד ב׳?",
        "איך מחשבים ציון גמר?",
      ]
    : [
        "How many credits left?",
        "What's missing for my degree?",
        "What's my average?",
        "Which focus area should I pick?",
        "How many seminars do I need?",
        "How do I advance a year?",
        "Can I make honors?",
        "My English status?",
        "What is binary?",
        "My miluim benefits?",
        "How does bidding work?",
        "When should I retake (Moed B)?",
        "How is my final grade computed?",
      ];
}

/** THE shared Hebrew fold (lib/hebrew-normalize) — the same function the two
 *  AI routers run, so the free engine and the router can never disagree about
 *  what a student asked. */
const normalize = normalizeHebrewForMatch;

// Keys are normalized once at module load — the matcher runs on every keystroke
// path, so we don't re-normalize the static key list per call.
const NORMALIZED_HANDLERS = HANDLERS.map((h) => ({
  handler: h,
  keys: h.keys.map(normalize).filter(Boolean),
}));

/**
 * Answer a free-text degree question from the student's own data. Deterministic;
 * returns a friendly fallback (with capabilities) when no intent matches.
 *
 * Matching is a normalized, length-weighted score: each handler earns the
 * combined length of its keys found in the (normalized) question, and the
 * highest-scoring handler wins. This fixes two failure modes of the old
 * first-substring-wins loop — niqqud/geresh/punctuation mismatches that dropped
 * a real question to the fallback, and an earlier, weaker handler stealing a
 * question that a later, more-specific handler describes better.
 */
export function answerDegreeQuestion(question: string, c: QAContext): QAAnswer {
  const q = normalize(question);
  if (!q) {
    return { text: he(c, `${gm(c, "שאל", "שאלי", "שאל/י")} אותי כל דבר על התואר שלך`, "Ask me anything about your degree"), matched: false };
  }
  // #22 — a human hello must not fall through to the capabilities wall ("לא
  // בטוח שהבנתי…"), which is the coldest sentence in the app. Checked BEFORE
  // the keyword table and only on a whole-question match, so it can never
  // hijack a real question ("מה קורה אם אני נכשל?" is not a greeting).
  const social = socialTalkKind(question);
  if (social) {
    return { ...socialAnswer(social, c), matched: true };
  }
  let best: Handler | null = null;
  let bestScore = 0;
  for (const { handler, keys } of NORMALIZED_HANDLERS) {
    let score = 0;
    for (const k of keys) {
      // Length-weighted: a longer, more-specific key ("עובר לא עובר") is a much
      // stronger signal than a short one ("קצב"), so it dominates the winner.
      if (q.includes(k)) score += k.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = handler;
    }
  }
  if (best) {
    return { ...best.answer(c), matched: true };
  }
  return {
    matched: false,
    text: he(
      c,
      `לא בטוח שהבנתי. אני יכול לעזור עם: כמה ש״ס נשארו, מה חסר לתואר, הממוצע שלך, בינארי, אנגלית/אמירנט, מילואים, סמינרים, תנאי מעבר שנה, תחום מיקוד, הצטיינות, ובידינג.`,
      `Not sure I got that. I can help with: credits left, what's missing, your average, binary, English/Amiram, miluim, seminars, year-transition rules, focus area, honors, and bidding.`
    ),
  };
}
