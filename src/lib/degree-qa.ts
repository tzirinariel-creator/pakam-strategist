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

import { CREDIT_REQUIREMENTS, GRADE_REQUIREMENTS, GRADE_WEIGHTS, SEMINAR_REQUIREMENTS, getEnglishLevel } from "@/lib/constants";

export interface QAContext {
  isHe: boolean;
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
  amiramScore: number | null;
  miluimGroupName: string | null; // localized group name, or null if NONE
  binaryRemaining: number;
  // Requirements
  failedRules: { nameHe: string; nameEn: string; deficit: number }[];
  seminarPlannedCount: number;
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

const HANDLERS: Handler[] = [
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
            "אין דרישות שאתה מפר כרגע 👍 מה שנשאר זה לצבור את הש״ס שחסרים — ראה 'המצב שלי' בדשבורד.",
            "You're not violating any requirement right now 👍 What's left is accumulating the remaining credits — see 'My status' on the dashboard."
          ),
          href: "/regulations",
          cta: he(c, "לפירוט הדרישות", "View requirements"),
        };
      }
      const top = c.failedRules
        .slice()
        .sort((a, b) => b.deficit - a.deficit)
        .slice(0, 3)
        .map((r) => `• ${c.isHe ? r.nameHe : r.nameEn}${r.deficit > 0 ? ` (${r.deficit} ש״ס)` : ""}`)
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
  // ── Average / GPA ─────────────────────────────────────────────────
  {
    keys: ["ממוצע", "הציון שלי", "gpa", "average", "my grade"],
    answer: (c) => {
      if (c.courseAverage === null) {
        return {
          text: he(c, "עדיין אין לך ציונים שמורים. הזן ציונים במחשבון הציונים ואראה לך את הממוצע.", "No grades recorded yet. Enter grades in the calculator and I'll show your average."),
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
        'בינארי = להמיר ציון מספרי ל"עובר/לא־עובר". הקורס עדיין נספר לתואר, אבל הציון יוצא מהממוצע. הטבת מילואים: עד 5 קורסים בתואר, ועד 25% מהשעות בשנה כדי לא לפגוע בהצטיינות. הכי כדאי על ציון נמוך-עובר בקורס כבד.',
        'Binary = convert a numeric grade to pass/fail. The course still counts for the degree, but the grade leaves your average. Miluim benefit: up to 5 courses across the degree, and ≤25% of yearly hours to keep honors. Best used on a low pass in a heavy course.'
      );
      const quota = c.miluimGroupName
        ? he(c, ` נשארו לך ${c.binaryRemaining} מתוך 5. סמן בכרטיס הקורס במתכנן (לקורס שהושלם עם ציון).`, ` You have ${c.binaryRemaining} of 5 left. Mark it on the course card in the planner.`)
        : he(c, " (זמין לזכאי מילואים בלבד.)", " (Available to miluim-eligible students only.)");
      return { text: base + quota, href: "/planner", cta: he(c, "למתכנן", "Open planner") };
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
        "מועד ב׳ = הזדמנות שנייה למבחן. שים לב: בישראל הציון האחרון קובע (לא הגבוה) — אז כדאי ללכת רק אם אתה בטוח שתשתפר. שיבוץ הלמידה, פריסה אחורה מכל מבחן ואיזון עומס — במתכנן המבחנים.",
        "Moed B is a second exam sitting. Note: in Israel the LAST grade counts (not the higher one) — so retake only if you're confident you'll improve. Study spread, reverse-planning and load balancing are in the exam planner."
      ),
      href: "/exam-planner",
      cta: he(c, "למתכנן המבחנים", "Exam planner"),
    }),
  },
  // ── Final-grade formula ───────────────────────────────────────────
  {
    keys: ["ציון גמר", "ציון סופי", "איך מחשבים ציון", "שקלול", "final grade", "grade formula", "how is my grade"],
    answer: (c) => ({
      text: he(
        c,
        `ציון הגמר משוקלל: ${Math.round(GRADE_WEIGHTS.COURSES * 100)}% ממוצע קורסי חובה+בחירה, ${Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}% מ-${SEMINAR_REQUIREMENTS.PAPERS} עבודות סמינריוניות, ו-${Math.round(GRADE_WEIGHTS.REFERAT * 100)}% רפרט.`,
        `Your final grade is weighted: ${Math.round(GRADE_WEIGHTS.COURSES * 100)}% course average, ${Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}% from ${SEMINAR_REQUIREMENTS.PAPERS} seminar papers, and ${Math.round(GRADE_WEIGHTS.REFERAT * 100)}% referat.`
      ),
      href: "/graduation",
      cta: he(c, "לצפי הגמר", "Graduation"),
    }),
  },
  // ── English / Amiram ──────────────────────────────────────────────
  {
    keys: ["אנגלית", "אמירם", "אמירנט", "english", "amiram"],
    answer: (c) => {
      const lvl = getEnglishLevel(c.amiramScore);
      const content = he(
        c,
        `חובה ${CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} קורסי תוכן באנגלית — יש לך ${c.englishCourseCount}.`,
        `${CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} English content courses required — you have ${c.englishCourseCount}.`
      );
      if (!lvl) {
        return {
          text: he(c, `${content} לא הזנת ציון אמירנט — הוסף אותו בהגדרות כדי לדעת אם אתה פטור או צריך קורסי רמה.`, `${content} You haven't entered an Amirnet score — add it in settings to see if you're exempt or owe level courses.`),
          href: "/settings",
          cta: he(c, "להגדרות", "Settings"),
        };
      }
      // Year-gate the LEVEL-course advice: the exemption deadline is end of
      // year 1, so a year-2+ student shouldn't be told to take level courses —
      // they should already be exempt (#11). The CONTENT courses still stand.
      const lvlTxt = lvl.isExempt
        ? he(c, `אתה פטור מקורסי רמה (אמירנט ${c.amiramScore}).`, `You're exempt from level courses (Amiram ${c.amiramScore}).`)
        : c.currentYear <= 1
          ? he(c, `אתה ב${lvl.nameHe} (אמירנט ${c.amiramScore}) — ${lvl.levelCourses} קורסי רמה. חובה להגיע לפטור (134+) עד סוף שנה א׳.`, `You're at ${lvl.nameEn} (Amiram ${c.amiramScore}) — ${lvl.levelCourses} level course(s). You must reach exemption (134+) by the end of Year 1.`)
          : he(c, `אתה ב${lvl.nameHe} (אמירנט ${c.amiramScore}), אבל הדדליין לפטור היה סוף שנה א׳ — אם עדיין אין לך פטור, פנה לייעוץ אקדמי (קורסי-התוכן באנגלית עדיין נדרשים).`, `You're at ${lvl.nameEn} (Amiram ${c.amiramScore}), but the exemption deadline was the end of Year 1 — if you're still not exempt, see academic advising (the English content courses are still required).`);
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
        return { text: he(c, "לא הגדרת שירות מילואים. אם שירתת — עדכן בהגדרות כדי לקבל את ההטבות (פטור ש״ס, בחירת מועדים, בינארי ועוד).", "No miluim service set. If you served, update it in settings to unlock benefits (credit exemption, exam-date choice, binary, and more).") , href: "/settings", cta: he(c, "להגדרות", "Settings") };
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
  {
    keys: ["מעבר שנה", "לעבור שנה", "תנאי מעבר", "advance a year", "year transition"],
    answer: (c) =>
      ({
        text: he(
          c,
          `כדי לעבור שנה צריך ממוצע כללי ${GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA} לפחות, וממוצע ${GRADE_REQUIREMENTS.YEAR_TRANSITION_PPE_GPA} בקורסי הפכ״מ. הממוצע הכללי שלך כרגע: ${c.courseAverage !== null ? c.courseAverage.toFixed(1) : "—"}.`,
          `To advance a year you need an overall average of at least ${GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA}, and ${GRADE_REQUIREMENTS.YEAR_TRANSITION_PPE_GPA} in PPE courses. Your current overall: ${c.courseAverage !== null ? c.courseAverage.toFixed(1) : "—"}.`
        ),
      }),
  },
  // ── Focus area ────────────────────────────────────────────────────
  {
    keys: ["התמחות", "תחום מיקוד", "מיקוד", "focus", "specialization"],
    answer: (c) => {
      if (!c.hasFocusArea) {
        return {
          text: he(
            c,
            `ההתמחות היא ${c.focusAreaTarget} ש״ס באחת משלוש הדיסציפלינות, והיא גם קובעת את הסיווג בשירות-המדינה:\n• פילוסופיה — חשיבה, אתיקה, לוגיקה ותורת-המדע.\n• כלכלה — הדיסציפלינה הכמותית ביותר: מודלים, נתונים ומדיניות.\n• מדע המדינה — ממשל, יחסים בין-לאומיים ומדיניות ציבורית.\nאיך בוחרים: לפי מה שהכי מסקרן אותך ללמוד לעומק (${c.focusAreaTarget} ש״ס זה הרבה) ולפי הכיוון שתרצה להתקדם אליו. שווה לעיין בקטלוג ולראות אילו קורסים מדברים אליך — בוחרים בהגדרות, ואפשר לשנות בהמשך.`,
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
          `התמחות: ${name ?? ""} — ${c.focusAreaCredits} מתוך ${c.focusAreaTarget} ש״ס${left > 0 ? `, נשארו ${left}` : " ✓"}.`,
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
          "בידינג = מכרז: המציע הגבוה זוכה (לא כל-הקודם-זוכה). 2 מקצים, הנקודות מתאפסות בכל מקצה, מינ' 5 לקורס, והרצאה+תרגיל ביחד. המלכודת: רישום לקורס שחופף בזמן מבטל את הקודם! ראה את המסביר המלא במתכנן.",
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
            "השלמת את כל הש״ס לתואר 🎉 נשאר רק לוודא שכל הדרישות מולאו — ראה 'המצב שלי'.",
            "You've completed all degree credits 🎉 Just confirm every requirement is met — see 'My status'."
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

/**
 * Fold the noise that trips plain substring matching, so paraphrases and
 * typos still land on the right intent: case, Hebrew niqqud/cantillation,
 * geresh/gershayim/quotes, any other punctuation, and final-letter forms
 * (ך/ם/ן/ף/ץ → base). Applied to BOTH the question and the keys, so e.g.
 * "ש״ס", "שס" and "ש\"ס" all match, and "עובר/לא-עובר" matches "עובר לא עובר".
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/־/g, " ") // Hebrew maqaf is a word joiner → space, not a mark to drop
    .replace(/[֑-ׇ]/g, "") // niqqud + cantillation marks
    .replace(/[׳״'"`]/g, "") // geresh / gershayim / quotes
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // any remaining punctuation → space
    .replace(/ך/g, "כ")
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ף/g, "פ")
    .replace(/ץ/g, "צ")
    .replace(/\s+/g, " ")
    .trim();
}

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
    return { text: he(c, "שאל אותי כל דבר על התואר שלך 🙂", "Ask me anything about your degree 🙂"), matched: false };
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
      `לא בטוח שהבנתי. אני יכול לעזור עם: כמה ש״ס נשארו, מה חסר לתואר, הממוצע שלך, בינארי, אנגלית/אמירנט, מילואים, סמינרים, תנאי מעבר שנה, התמחות, הצטיינות, ובידינג.`,
      `Not sure I got that. I can help with: credits left, what's missing, your average, binary, English/Amiram, miluim, seminars, year-transition rules, focus area, honors, and bidding.`
    ),
  };
}
