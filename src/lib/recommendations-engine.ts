// =========================================
// Smart Recommendations Engine
// =========================================
// Deterministic, data-backed recommendations for the dashboard.
//
// Pure function: takes the student's already-fetched plan/grades/credits/
// regulation state and returns a RANKED list of actionable recommendations.
// No new server round-trips — everything is computed from data the dashboard
// already has in hand.
//
// Design rule (per docs/תוכנית-המשך.md): never invent. Each recommendation is
// derived from a concrete fact in the student's data — a real grade, a real
// exam date, a real unmet requirement. If the data isn't there, the
// recommendation isn't shown.

import { CREDIT_REQUIREMENTS, GRADE_REQUIREMENTS, resolveEnglishLevel } from "@/lib/constants";
import { hasMiluimBinaryBenefit, type MiluimGroupKey } from "@/lib/miluim";
import { countPassedEnglishLevelCourses, resolveEnglishStanding } from "@/lib/english-standing";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export type RecommendationSeverity = "critical" | "warning" | "info" | "success";

/** Icon is referenced by key; the widget maps key → Lucide component. */
export type RecommendationIcon =
  | "calendarClock"
  | "trendingDown"
  | "trendingUp"
  | "languages"
  | "target"
  | "fileText"
  | "scale"
  | "graduationCap";

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  icon: RecommendationIcon;
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
  /** Where the "act on this" link goes (app route, locale-prefixed by caller). */
  href: string;
  ctaHe: string;
  ctaEn: string;
  /** Lower = higher priority (sorts to the top). */
  priority: number;
}

// Minimal shapes — intentionally loose so the engine stays decoupled from the
// full Prisma types. The dashboard already has all of this in memory.
export interface RecCourse {
  status: string; // CourseStatus
  grade: number | null;
  courseType: string; // CourseType
  isMandatory: boolean;
  /** Miluim pass/fail conversion — its numeric grade is not in play. */
  isBinary: boolean;
  /** Course credit weight — heavier low-grade courses are better binary candidates. */
  credits: number;
  nameHe: string;
  nameEn: string | null;
  examDateB: Date | string | null;
  /** Resolved discipline (override ?? course.discipline). */
  discipline: string;
}

export interface RecRegulationResult {
  ruleId: string;
  ruleNameHe: string;
  ruleNameEn: string;
  passed: boolean;
  severity: string; // "ERROR" | "WARNING" | "INFO"
  details?: Record<string, unknown>;
}

export interface RecommendationInput {
  courses: RecCourse[];
  /** Credit-weighted overall course average (GradeBreakdown.courseAverage). */
  courseAverage: number | null;
  englishCourseCount: number;
  /** Amiram/Amirnet English placement score (50–150), or null if unknown. */
  amiramScore: number | null;
  /** #23 — declared English level (grade sheet); overrides the score. */
  englishLevel?: string | null;
  hasFocusArea: boolean;
  currentYear: number;
  /** Current miluim group key (e.g. "GROUP_C") — gates the binary suggestion. */
  miluimGroup: string;
  /** Binary (pass/fail) conversions still available across the degree. */
  binaryRemaining: number;
  regulationResults: RecRegulationResult[];
  /** Injected so the engine stays pure/testable. */
  now: Date;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** A grade is "worth retaking" when it's below the relevant passing bar. */
function isRetakeWorthy(course: RecCourse): boolean {
  if (course.grade === null) return false;
  // Binary (pass/fail) courses have no numeric grade in play — nothing to retake.
  if (course.isBinary) return false;
  // The higher 80 bar applies ONLY to the PPE-dedicated (PPE_CORE) courses —
  // per the year-transition rule PKM-017; every other course (including other
  // mandatory ones like Philosophy/Economics/Law) is measured against the
  // general 75 bar. Using isMandatory here wrongly flagged 75–79 passes in
  // non-PPE_CORE mandatory courses as retake-worthy (audit finding).
  const bar =
    course.discipline === "PPE_CORE"
      ? GRADE_REQUIREMENTS.YEAR_TRANSITION_PPE_GPA
      : GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA;
  return course.grade < bar;
}

function daysUntil(date: Date | string, now: Date): number {
  const d = new Date(date);
  if (isNaN(d.getTime())) return NaN;
  const dUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const nUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dUTC - nUTC) / (1000 * 60 * 60 * 24));
}

function courseName(c: RecCourse, isHe: boolean): string {
  return isHe ? c.nameHe : (c.nameEn ?? c.nameHe);
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

/**
 * Build a ranked list of recommendations from the student's current state.
 * Returns at most `limit` items, highest-priority first.
 */
export function buildRecommendations(
  input: RecommendationInput,
  limit = 4
): Recommendation[] {
  const recs: Recommendation[] = [];
  const completed = input.courses.filter(
    (c) => c.status === "COMPLETED" && c.grade !== null
  );

  // 1. Year-transition GPA risk — overall average below the transition bar.
  const overallBar = GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA;
  if (input.courseAverage !== null && input.courseAverage < overallBar) {
    const avg = input.courseAverage.toFixed(1);
    recs.push({
      id: "gpa-risk",
      severity: "critical",
      icon: "trendingDown",
      titleHe: "הממוצע הכללי מתחת לסף מעבר השנה",
      titleEn: "Overall average below the year-transition bar",
      bodyHe: `הממוצע הכללי שלכם הוא ${avg}, מתחת לסף ${overallBar} למעבר שנה. שווה לכוון לציונים גבוהים בקורסים הקרובים ולשקול מועד ב׳ בקורסים החלשים.`,
      bodyEn: `Your overall average is ${avg}, below the ${overallBar} bar for advancing a year. Aim high on upcoming courses and consider Moed B on weaker ones.`,
      href: "/graduation",
      ctaHe: "למחשבון הציונים",
      ctaEn: "Grade calculator",
      priority: 0,
    });
  }

  // 2. Moed B opportunity — a completed course with a retake-worthy grade whose
  //    second-sitting date is still ahead. Time-sensitive and fully data-backed.
  const moedBCandidates = completed
    .filter((c) => isRetakeWorthy(c) && c.examDateB)
    .map((c) => ({ c, days: daysUntil(c.examDateB as Date | string, input.now) }))
    .filter((x) => !isNaN(x.days) && x.days >= 0)
    .sort((a, b) => a.days - b.days);

  for (const [idx, { c, days }] of moedBCandidates.slice(0, 2).entries()) {
    const nameHe = courseName(c, true);
    const nameEn = courseName(c, false);
    const whenHe =
      days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`;
    const whenEn = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    recs.push({
      // idx keeps two attempts of the same course from colliding on key.
      id: `moed-b-${idx}-${c.nameHe}`,
      severity: days <= 7 ? "warning" : "info",
      icon: "calendarClock",
      titleHe: `כדאי לשקול מועד ב׳ ב${nameHe}`,
      titleEn: `Consider Moed B in ${nameEn}`,
      bodyHe: `קיבלתם ${c.grade} ב${nameHe}. מועד ב׳ ${whenHe} — אפשרות לשפר. שימו לב: בת״א הציון האחרון קובע (לא הגבוה), אז שווה לגשת רק אם אתם בטוחים שתשתפרו.`,
      bodyEn: `You got ${c.grade} in ${nameEn}. Moed B is ${whenEn} — a chance to improve. Note: in Israel the LAST sitting counts (not the higher), so only go if you're confident you'll do better.`,
      href: "/exam",
      ctaHe: "ללוח הבחינות",
      ctaEn: "Exam schedule",
      priority: 1 + days / 365, // sooner = higher
    });
  }

  // 3. English requirement — short on English courses, and far enough into the
  //    degree that it should be on the radar.
  const englishNeeded =
    CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES - input.englishCourseCount;
  if (englishNeeded > 0 && input.currentYear >= 2) {
    recs.push({
      id: "english",
      severity: "warning",
      icon: "languages",
      titleHe: `חסרים ${englishNeeded} קורסי אנגלית`,
      titleEn: `${englishNeeded} English course${englishNeeded > 1 ? "s" : ""} still needed`,
      bodyHe: `התואר דורש ${CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} קורסים באנגלית. אלה ש״ס קלות יחסית — עדיף לסגור אותן מוקדם ולא להישאר איתן לשנה ג׳.`,
      bodyEn: `The degree requires ${CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES} English courses. They're relatively easy credits — close them early rather than carrying them into Year 3.`,
      href: "/catalog",
      ctaHe: "לקטלוג הקורסים",
      ctaEn: "Course catalog",
      priority: 2,
    });
  }

  // 3b. Amiram/English placement — the BLOCKING exemption deadline (PKM-022): a
  //     non-exempt student must reach פטור (score 134+) by the end of Year 1, or
  //     studies stop. Highest urgency while still in Year 1.
  if (input.currentYear <= 1) {
    const resolvedLvl = resolveEnglishLevel(input.englishLevel, input.amiramScore);
    const lvlDeclared = resolveEnglishLevel(input.englishLevel, null) != null;
    // #6/#18 (13.8) — credit the level courses the student already PASSED before
    // telling them to take one. Ariel holds a passing grade in אנגלית מתקדמים ב׳
    // and was still being told to "take a level course or retake Amiram", and
    // still being asked for an Amiram score his sheet had answered.
    const standing = resolveEnglishStanding(resolvedLvl, input.courses);
    const passedLevelCourses = countPassedEnglishLevelCourses(input.courses);
    if (!resolvedLvl && passedLevelCourses === 0) {
      recs.push({
        id: "amiram-missing",
        severity: "info",
        icon: "languages",
        titleHe: "חסר ציון אמירנט בפרופיל",
        titleEn: "Add your Amiram score",
        bodyHe: "ציון האמירנט קובע את תוכנית-האנגלית שלכם (פטור או קורסי-רמה). שווה להוסיף אותו בהגדרות כדי לראות מה נדרש ועד מתי.",
        bodyEn: "Your Amiram score sets your English plan (exemption or level courses). Add it in settings to see what's required and by when.",
        href: "/settings",
        ctaHe: "להגדרות",
        ctaEn: "Open settings",
        priority: 1.5,
      });
    } else if (resolvedLvl) {
      const lvl = resolvedLvl;
      const remaining = standing?.levelCoursesRemaining ?? lvl.levelCourses;
      // Fire only when level courses are genuinely still outstanding. Exempt by
      // placement, or the level track already finished by passing the courses —
      // either way there is nothing to recommend, so say nothing.
      if (!lvl.isExempt && remaining > 0) {
        const passedNote = passedLevelCourses > 0
          ? ` (${passedLevelCourses} כבר עברתם — נספרו)`
          : "";
        recs.push({
          id: "amiram-deadline",
          severity: "warning",
          icon: "languages",
          titleHe: `אנגלית: ${lvl.nameHe}${lvlDeclared ? "" : ` (אמירנט ${input.amiramScore})`}`,
          titleEn: `English: ${lvl.nameEn}${lvlDeclared ? "" : ` (Amiram ${input.amiramScore})`}`,
          bodyHe: `${lvlDeclared ? "לפי הרמה שנקלטה מהגיליון" : `לפי הציון שהזנתם (${input.amiramScore})`} אתם ב${lvl.nameHe} — חסרים ${remaining} קורסי-רמה${passedNote}. לפי התקנון (נכון לתשפ״ו) צריך להגיע לפטור (134+) עד סוף שנה א׳. האופציות: קורס-רמה או מבחן אמירנט חוזר.`,
          bodyEn: `${lvlDeclared ? "Per the level from your grade sheet" : `Per the score you entered (${input.amiramScore})`} you're at ${lvl.nameEn} — ${remaining} level course(s) to go. Regulations (as of 2025-26) require exemption (134+) by end of Year 1. Take a level course or retake Amiram.`,
          href: "/catalog",
          ctaHe: "לקורסי אנגלית",
          ctaEn: "English courses",
          priority: 0.5,
        });
      }
    }
  }

  // 4. Most urgent unmet requirement — top ERROR-severity failed rule with a
  //    real deficit. (The full list lives in the gap widget; here we surface the
  //    single most pressing one as a nudge.)
  const topGap = input.regulationResults
    .filter((r) => !r.passed && r.severity === "ERROR")
    .map((r) => ({ r, deficit: Number(r.details?.deficit ?? 0) }))
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)[0];

  if (topGap) {
    const { r, deficit } = topGap;
    recs.push({
      id: `gap-${r.ruleId}`,
      severity: "warning",
      icon: "scale",
      titleHe: `חסר: ${r.ruleNameHe}`,
      titleEn: `Missing: ${r.ruleNameEn}`,
      bodyHe: `חסרים לך ${deficit} ש״ס כדי לעמוד בדרישה הזו. אפשר לסגור את הפער עם קורס מתאים מהקטלוג.`,
      bodyEn: `You're ${deficit} credits short of meeting this requirement. Close the gap with a matching course from the catalog.`,
      href: "/regulations",
      ctaHe: "לפירוט הדרישות",
      ctaEn: "View requirements",
      priority: 3,
    });
  }

  // 5. No focus area chosen — it drives 60 credits and the civil-service track.
  if (!input.hasFocusArea) {
    recs.push({
      id: "focus-area",
      severity: "info",
      icon: "target",
      titleHe: "עוד לא בחרת תחום מיקוד",
      titleEn: "No focus area chosen yet",
      bodyHe: `תחום המיקוד קובע ${CREDIT_REQUIREMENTS.FOCUS_AREA_MIN} ש״ס מהתואר — וגם את הסיווג שלכם בשירות המדינה. כדאי לבחור מוקדם כדי לתכנן נכון.`,
      bodyEn: `Your focus area determines ${CREDIT_REQUIREMENTS.FOCUS_AREA_MIN} credits of the degree — and your civil-service classification. Pick early to plan well.`,
      href: "/settings",
      ctaHe: "לבחירת תחום מיקוד",
      ctaEn: "Choose focus area",
      priority: 4,
    });
  }

  // 6. Seminar planning — Year 2+ with nothing seminar-shaped planned. Seminars
  //    are 18% of the final grade and the popular ones fill up fast.
  const seminarCount = input.courses.filter(
    (c) => c.courseType === "SEMINAR"
  ).length;
  if (seminarCount === 0 && input.currentYear >= 2) {
    recs.push({
      id: "seminar",
      severity: "info",
      icon: "fileText",
      titleHe: "עדיין לא תכננת סמינריון",
      titleEn: "No seminar planned yet",
      bodyHe: "3 עבודות סמינריוניות שוות 18% מציון הגמר, והמקומות בסמינרים הפופולריים נגמרים מהר. שווה לשבץ סמינר בתכנון.",
      bodyEn: "Three seminar papers are 18% of the final score, and popular seminars fill up fast. Worth slotting one into your plan.",
      href: "/planner",
      ctaHe: "לתכנון",
      ctaEn: "Open planner",
      priority: 5,
    });
  }

  // 7. Grade-improvement nudge — a retake-worthy grade with NO upcoming Moed B
  //    (so #2 didn't cover it). You may improve up to 2 grades across the degree.
  const improvable = completed
    .filter((c) => isRetakeWorthy(c))
    .filter((c) => {
      if (!c.examDateB) return true;
      const d = daysUntil(c.examDateB, input.now);
      return isNaN(d) || d < 0; // no future Moed B
    })
    .sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0))[0];

  if (improvable) {
    const nameHe = courseName(improvable, true);
    const nameEn = courseName(improvable, false);
    recs.push({
      id: `improve-${improvable.nameHe}`,
      severity: "info",
      icon: "trendingUp",
      titleHe: `אפשר לשפר ציון ב${nameHe}`,
      titleEn: `Consider improving your grade in ${nameEn}`,
      bodyHe: `קיבלת ${improvable.grade} ב${nameHe}. אפשר לשפר עד ${GRADE_REQUIREMENTS.MAX_GRADE_IMPROVEMENTS} ציונים לאורך התואר — עדיף לשמור את ההזדמנות לקורסים שהכי משפיעים על הממוצע.`,
      bodyEn: `You got ${improvable.grade} in ${nameEn}. You may improve up to ${GRADE_REQUIREMENTS.MAX_GRADE_IMPROVEMENTS} grades across the degree — save it for the courses that move your average most.`,
      href: "/graduation",
      ctaHe: "למחשבון הציונים",
      ctaEn: "Grade calculator",
      priority: 6,
    });
  }

  // 8. Binary candidate (miluim benefit) — a low-grade, heavy, non-seminar
  //    course drags the credit-weighted GPA; converting it to pass/fail removes
  //    the drag while keeping the credit. Only for groups that actually grant
  //    the binary benefit (B/C — the single hasMiluimBinaryBenefit gate, so this
  //    agrees with the "My benefits" window and the record advisor). Excludes
  //    seminars and courses with a future Moed B (retaking is the better move).
  const binaryEligible =
    hasMiluimBinaryBenefit(input.miluimGroup as MiluimGroupKey) &&
    input.binaryRemaining > 0;
  if (binaryEligible) {
    const candidate = completed
      .filter(
        (c) =>
          !c.isBinary &&
          c.courseType !== "SEMINAR" &&
          c.grade !== null &&
          // Must have PASSED: you can only convert a passing grade to pass/fail.
          // A failed course (below the passing grade) is a RETAKE, not a binary
          // candidate — suggesting binary on a fail is nonsense (#10).
          c.grade >= CREDIT_REQUIREMENTS.PASSING_GRADE &&
          c.grade < GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA &&
          // a future Moed B → retake the grade instead of locking it as pass/fail
          !(c.examDateB && daysUntil(c.examDateB, input.now) >= 0)
      )
      // worst drag first: lowest grade, then heaviest course
      .sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0) || b.credits - a.credits)[0];

    if (candidate) {
      const nameHe = courseName(candidate, true);
      const nameEn = courseName(candidate, false);
      recs.push({
        id: `binary-candidate-${candidate.nameHe}`,
        severity: "info",
        icon: "trendingUp",
        titleHe: `מועמד טוב לבינארי: ${nameHe}`,
        titleEn: `Good binary candidate: ${nameEn}`,
        bodyHe: `הציון ${candidate.grade} ב${nameHe} (${candidate.credits} ש״ס) מושך את הממוצע למטה. כמילואימניק אפשר להמיר אותו ל"עובר/לא־עובר" — הקורס עדיין נספר, הציון יוצא מהממוצע. נשארו ${input.binaryRemaining} מתוך 5. (מסמנים בכרטיס הקורס במתכנן.)`,
        bodyEn: `Your ${candidate.grade} in ${nameEn} (${candidate.credits} cr.) drags your average down. As a miluim student you can convert it to pass/fail — the course still counts, the grade leaves your average. ${input.binaryRemaining} of 5 left. (Toggle it on the course card in the planner.)`,
        href: "/planner",
        ctaHe: "למתכנן",
        ctaEn: "Open planner",
        priority: 5.5,
      });
    }
  }

  return recs.sort((a, b) => a.priority - b.priority).slice(0, limit);
}
