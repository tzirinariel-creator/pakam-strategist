import type { RuleContext, RegulationRule } from "@/types/regulation";
import { resolveEnglishLevel, ENGLISH_CONFIG } from "@/lib/constants";
import { result } from "./_result";

// -------------------------------------------------------------------
// PKM-012: English requirement — 2 courses taught IN English (any discipline)
// -------------------------------------------------------------------

export const ruleEnglishRequirement: RegulationRule = (ctx: RuleContext) => {
  const minCourses = ctx.programDefinition.creditRequirements.englishCourses;

  // If no English course requirement, pass trivially
  if (minCourses === 0) {
    return result(
      "PKM-012",
      "Courses in English",
      "קורסים באנגלית",
      true,
      "INFO",
      "No English course requirements for this program.",
      "אין דרישת קורסים באנגלית בתוכנית זו.",
      { currentCourses: 0, minCourses: 0 }
    );
  }

  const minCreditsPerCourse = 2; // universal: each English course must be ≥ 2 SH"S
  const minCredits = minCourses * minCreditsPerCourse;
  const currentCredits = ctx.creditBreakdown.english;
  const currentCourses = ctx.creditBreakdown.englishCourseCount;
  // Must take 2 SEPARATE English content courses (domain rules §5). A single
  // multi-credit course does NOT satisfy this, so the requirement is on the
  // course COUNT — credits are not an alternative path.
  const passed = currentCourses >= minCourses;

  // Severity: the 2 English CONTENT courses are a graduation PROGRESS target a
  // student earns over the degree, not a mid-degree violation → INFO. (The
  // BLOCKING English item is the AMIRANT exemption DEADLINE, rule PKM-022.)
  return result(
    "PKM-012",
    "Courses in English",
    "קורסים באנגלית",
    passed,
    "INFO",
    passed
      ? `Requirement met: ${currentCourses} course(s) taught in English, ${currentCredits} credits.`
      : `Need ${minCourses} courses taught in English: have ${currentCourses}/${minCourses}, ${currentCredits}/${minCredits} credits.`,
    passed
      ? `דרישה מתקיימת: ${currentCourses} קורסים באנגלית, ${currentCredits} ש״ס.`
      : `נדרשים ${minCourses} קורסים באנגלית: יש ${currentCourses}/${minCourses}, ${currentCredits}/${minCredits} ש״ס.`,
    { currentCourses, minCourses, currentCredits, minCredits }
  );
};

// -------------------------------------------------------------------
// PKM-021: English LEVEL (preparatory) requirement from AMIRANT score
// -------------------------------------------------------------------
// Informational: reports the student's English level and how many LEVEL
// (preparatory) courses they still need based on the AMIRANT score. These
// LEVEL courses are PREPARATORY — NOT in the 150 credits and NOT in the
// final grade, and are SEPARATE from the 2 English CONTENT courses (PKM-012).
// נכון לתשפ"ו. Neutral (skipped) when the score is null.

export const ruleEnglishLevel: RegulationRule = (ctx: RuleContext) => {
  // #23 — a level declared directly on the grade sheet (englishLevel) wins over
  // the AMIRANT score, and lets the rule fire even with no score at all.
  const info = resolveEnglishLevel(ctx.englishLevel, ctx.amirantScore);

  // No score AND no declared level → stay neutral, do not error.
  if (!info) {
    return result(
      "PKM-021",
      "English Level (AMIRANT)",
      "רמת אנגלית (אמירנט)",
      true,
      "INFO",
      "No AMIRANT score provided — English level cannot be determined.",
      "לא הוזן ציון אמירנט — לא ניתן לקבוע רמת אנגלית. (נכון לתשפ״ו)",
      { amirantScore: null }
    );
  }

  const { level, nameHe, nameEn, levelCourses, isExempt, isRejected } = info;
  // Source label: an exact "AMIRANT <score>" when a score exists (keeps the
  // score-based wording byte-identical), else the grade-sheet level itself.
  const score = ctx.amirantScore ?? null;
  const srcEn = score != null ? `AMIRANT ${score}` : `English level ${nameEn}`;
  const srcHe = score != null ? `אמירנט ${score}` : `רמת אנגלית ${nameHe}`;

  // טרום בסיסי (≤84): below TAU admission minimum — blocking (auto-rejection).
  if (isRejected) {
    return result(
      "PKM-021",
      "English Level (AMIRANT)",
      "רמת אנגלית (אמירנט)",
      false,
      "ERROR",
      `${srcEn} → ${nameEn} (pre-basic): below the admission minimum (auto-rejection). At least ${levelCourses} level courses would be required.`,
      `${srcHe} → ${nameHe}: מתחת לרף הקבלה (דחייה אוטומטית). נדרשים לפחות ${levelCourses} קורסי רמה. (נכון לתשפ״ו)`,
      { amirantScore: score, level, levelCourses, isExempt, isRejected }
    );
  }

  return result(
    "PKM-021",
    "English Level (AMIRANT)",
    "רמת אנגלית (אמירנט)",
    true,
    "INFO",
    isExempt
      ? `${srcEn} → ${nameEn}: exempt from level courses. The 2 English content courses still apply.`
      : `${srcEn} → ${nameEn}: ${levelCourses} preparatory level course(s) still needed (not counted in the 150 credits). The 2 English content courses still apply.`,
    isExempt
      ? `${srcHe} → ${nameHe}: פטור מקורסי רמה. עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ״ו)`
      : `${srcHe} → ${nameHe}: נדרשים עוד ${levelCourses} קורסי רמה (לא נספרים ב-150 ש״ס). עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ״ו)`,
    { amirantScore: score, level, levelCourses, isExempt, isRejected }
  );
};

// -------------------------------------------------------------------
// PKM-022: Humanities English EXEMPTION deadline (BLOCKING)
// -------------------------------------------------------------------
// A student who is NOT exempt (score < 134) must reach exemption (פטור) by the
// END OF THE 2ND SEMESTER (year 1, semester B), else studies stop. We warn
// while still within the window and ERROR once past it without exemption.
// נכון לתשפ"ו. Neutral when the score is null or the student is exempt.

export const ruleEnglishExemptionDeadline: RegulationRule = (ctx: RuleContext) => {
  // #23 — the grade-sheet level wins over the score and lets this deadline rule
  // fire even for a student who knows only their level, not their number.
  const info = resolveEnglishLevel(ctx.englishLevel, ctx.amirantScore);
  const score = ctx.amirantScore ?? null;
  const srcEn = score != null ? `AMIRANT ${score}` : `English level from the grade sheet`;
  const srcHe = score != null ? `אמירנט ${score}` : `רמת אנגלית מהגיליון`;

  // No score AND no declared level → stay neutral.
  if (!info) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      true,
      "INFO",
      "No AMIRANT score provided — exemption deadline cannot be evaluated.",
      "לא הוזן ציון אמירנט — לא ניתן להעריך את המועד האחרון לפטור. (נכון לתשפ״ו)",
      { amirantScore: null }
    );
  }

  // Already exempt → requirement satisfied.
  if (info.isExempt) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      true,
      "INFO",
      `Exempt from English (${srcEn}). No exemption deadline applies.`,
      `פטור מאנגלית (${srcHe}). אין מועד אחרון רלוונטי. (נכון לתשפ״ו)`,
      { amirantScore: ctx.amirantScore, level: info.level, isExempt: true }
    );
  }

  // Not exempt: must reach exemption by end of year-1 semester B.
  const deadlineYear = ENGLISH_CONFIG.EXEMPTION_DEADLINE_YEAR;       // 1
  const deadlineSem = ENGLISH_CONFIG.EXEMPTION_DEADLINE_SEMESTER;    // "SPRING"

  const year = ctx.academicYear;
  const sem = ctx.currentSemester;

  // Without academic standing we can only warn (cannot tell if past the deadline).
  if (year == null || !sem) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      false,
      "WARNING",
      `Not yet exempt in English (${srcEn}, ${info.nameEn}). You must reach exemption by the end of the 2nd semester (year 1, semester B) or studies stop.`,
      `עדיין לא הושג פטור באנגלית (${srcHe}, ${info.nameHe}). יש להגיע לפטור עד סוף הסמסטר השני (שנה א׳, סמסטר ב׳) אחרת הלימודים נפסקים. (נכון לתשפ״ו)`,
      { amirantScore: ctx.amirantScore, level: info.level, isExempt: false }
    );
  }

  // Compute whether we are PAST the deadline. Semester ordering: FALL < SPRING < SUMMER.
  const semRank: Record<string, number> = { FALL: 0, SPRING: 1, SUMMER: 2 };
  const deadlineRank = year > deadlineYear
    ? Infinity // any semester in a later year is already past
    : (semRank[deadlineSem] ?? 1);
  const currentRank = (semRank[sem] ?? 0);
  const pastDeadline =
    year > deadlineYear ||
    (year === deadlineYear && currentRank > (semRank[deadlineSem] ?? 1));

  if (pastDeadline) {
    // Non-blocking: this fires off a SELF-REPORTED AMIRANT score + current year.
    // A student who already reached exemption but never updated their score in
    // Settings would otherwise see a false, alarming red block — so we WARN (not
    // ERROR) and tell them to update the score if they're already exempt.
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      false,
      "WARNING",
      `Past the English exemption deadline (end of year 1, semester B) without exemption (${srcEn}, ${info.nameEn}). Reach exemption to continue — if you're already exempt, update your AMIRANT score in Settings.`,
      `חלף המועד האחרון לפטור באנגלית (סוף שנה א׳, סמסטר ב׳) ללא פטור (${srcHe}, ${info.nameHe}). יש להגיע לפטור כדי להמשיך — אם כבר קיבלתם פטור, עדכנו את ציון האמירנט בהגדרות. (נכון לתשפ״ו)`,
      { amirantScore: ctx.amirantScore, level: info.level, isExempt: false, pastDeadline: true }
    );
  }

  // Still within the window → warn so the student acts in time.
  return result(
    "PKM-022",
    "English Exemption Deadline",
    "מועד אחרון לפטור באנגלית",
    false,
    "WARNING",
    `Not yet exempt in English (${srcEn}, ${info.nameEn}). Reach exemption by the end of the 2nd semester (year 1, semester B) — ${info.levelCourses} level course(s) needed — or studies stop.`,
    `עדיין לא הושג פטור באנגלית (${srcHe}, ${info.nameHe}). יש להגיע לפטור עד סוף הסמסטר השני (שנה א׳, סמסטר ב׳) — נדרשים ${info.levelCourses} קורסי רמה — אחרת הלימודים נפסקים. (נכון לתשפ״ו)`,
    { amirantScore: ctx.amirantScore, level: info.level, isExempt: false, pastDeadline: false, currentRank, deadlineRank }
  );
};
