import type { RuleContext, RegulationRule } from "@/types/regulation";
import { resolveEnglishLevel, ENGLISH_CONFIG } from "@/lib/constants";
import { resolveEnglishStanding } from "@/lib/english-standing";
import { result } from "./_result";
import { heNoun } from "@/lib/he-count";

/** The shape resolveEnglishStanding reads, projected off the rule context. */
function levelCourseRows(ctx: RuleContext) {
  return ctx.userCourses.map((uc) => ({
    nameHe: uc.course.nameHe,
    grade: uc.grade,
    isBinary: (uc as { isBinary?: boolean }).isBinary,
    status: uc.status,
  }));
}

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
      ? `דרישה מתקיימת: ${heNoun(currentCourses, "קורס", "קורסים")} באנגלית, ${currentCredits} ש״ס.`
      : `נדרשים ${heNoun(minCourses, "קורס", "קורסים")} באנגלית: יש ${currentCourses}/${minCourses}, ${currentCredits}/${minCredits} ש״ס.`,
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

  const { level, nameHe, nameEn, isExempt, isRejected } = info;
  // Credit the preparatory LEVEL courses the student has already PASSED before
  // telling them how many are "still needed" (#6/#18, src/lib/english-standing.ts).
  // `info.levelCourses` is a PLACEMENT constant — the courses the level implies
  // from scratch — so a student holding a pass in אנגלית מתקדמים ב׳ was told to
  // go take the course they had already passed. This is arithmetic on a
  // remainder, not a new regulation: it never claims a pass grants פטור (that
  // stays with the מזכירות, and PKM-022 below is untouched).
  const standing = resolveEnglishStanding(info, levelCourseRows(ctx));
  const levelCourses = standing?.levelCoursesRemaining ?? info.levelCourses;
  const passedLevelCourses = standing?.passedLevelCourses ?? 0;
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

  // Level track finished by coursework (not exempt by placement). We say the
  // courses are done — NEVER that the student is exempt; confirming פטור is the
  // מזכירות's call (english-standing.ts states this explicitly).
  const levelTrackDone = !isExempt && levelCourses === 0 && passedLevelCourses > 0;

  let messageEn: string;
  let messageHe: string;
  if (isExempt) {
    messageEn = `${srcEn} → ${nameEn}: exempt from level courses. The 2 English content courses still apply.`;
    messageHe = `${srcHe} → ${nameHe}: פטור מקורסי רמה. עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ״ו)`;
  } else if (levelTrackDone) {
    messageEn = `${srcEn} → ${nameEn}: you have passed the ${passedLevelCourses} preparatory level course(s) your placement required — none left to take. Confirm your exemption status with the department office. The 2 English content courses still apply.`;
    messageHe = `${srcHe} → ${nameHe}: עברתם את ${passedLevelCourses} קורסי הרמה שנדרשו לפי הסיווג — לא נותרו קורסי רמה. את מעמד הפטור עצמו כדאי לאמת מול המזכירות. עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ״ו)`;
  } else {
    messageEn = `${srcEn} → ${nameEn}: ${levelCourses} preparatory level course(s) still needed (not counted in the 150 credits). The 2 English content courses still apply.`;
    messageHe = `${srcHe} → ${nameHe}: נדרשים עוד ${levelCourses} קורסי רמה (לא נספרים ב-150 ש״ס). עדיין נדרשים 2 קורסי תוכן באנגלית. (נכון לתשפ״ו)`;
  }

  return result(
    "PKM-021",
    "English Level (AMIRANT)",
    "רמת אנגלית (אמירנט)",
    true,
    "INFO",
    messageEn,
    messageHe,
    {
      amirantScore: score,
      level,
      levelCourses,
      passedLevelCourses,
      isExempt,
      isRejected,
      levelTrackDone,
    }
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

  // Level courses the student has ALREADY PASSED count here exactly as they do
  // in PKM-021. Without this the two rules contradicted each other on the same
  // page for the same student: PKM-021 said "עברתם את קורסי הרמה — לא נותרו",
  // while this rule still quoted the raw PLACEMENT constant ("נדרשים 1 קורסי
  // רמה") and threatened that studies stop. Same standing helper, one number.
  const standing = resolveEnglishStanding(info, levelCourseRows(ctx));
  const levelCoursesRemaining = standing?.levelCoursesRemaining ?? info.levelCourses;
  const levelTrackDone = levelCoursesRemaining === 0 && (standing?.passedLevelCourses ?? 0) > 0;

  // The level ladder is finished by coursework. We still do NOT declare פטור —
  // only the מזכירות can — but the honest action is "confirm it", not "reach an
  // exemption you have already worked for, or your studies stop".
  if (levelTrackDone) {
    return result(
      "PKM-022",
      "English Exemption Deadline",
      "מועד אחרון לפטור באנגלית",
      false,
      "WARNING",
      `You have passed every preparatory level course your placement required (${srcEn}, ${info.nameEn}). Confirm the exemption itself with the department office — the deadline is the end of the 2nd semester.`,
      `עברתם את כל קורסי הרמה שנדרשו לפי הסיווג (${srcHe}, ${info.nameHe}). את הפטור עצמו צריך לאמת מול המזכירות — המועד האחרון הוא סוף הסמסטר השני. (נכון לתשפ״ו)`,
      {
        amirantScore: ctx.amirantScore,
        level: info.level,
        isExempt: false,
        levelCoursesRemaining: 0,
        levelTrackDone: true,
      },
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
    `Not yet exempt in English (${srcEn}, ${info.nameEn}). Reach exemption by the end of the 2nd semester (year 1, semester B) — ${levelCoursesRemaining} level course(s) needed — or studies stop.`,
    `עדיין לא הושג פטור באנגלית (${srcHe}, ${info.nameHe}). יש להגיע לפטור עד סוף הסמסטר השני (שנה א׳, סמסטר ב׳) — נדרשים ${levelCoursesRemaining} קורסי רמה — אחרת הלימודים נפסקים. (נכון לתשפ״ו)`,
    { amirantScore: ctx.amirantScore, level: info.level, isExempt: false, pastDeadline: false, levelCoursesRemaining, currentRank, deadlineRank }
  );
};
