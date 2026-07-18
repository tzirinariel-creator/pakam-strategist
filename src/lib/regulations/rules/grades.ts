import type { RuleContext, RegulationRule } from "@/types/regulation";
import { GRADE_REQUIREMENTS } from "@/lib/constants";
import { result } from "./_result";

// -------------------------------------------------------------------
// PKM-013: Graduation score >= 60 (passing grade)
// -------------------------------------------------------------------

export const ruleGraduationScore: RegulationRule = (ctx: RuleContext) => {
  const requiredScore = ctx.programDefinition.creditRequirements.graduationMinScore;
  const score = ctx.gradeBreakdown.weightedScore;

  if (score === null) {
    return result(
      "PKM-013",
      "Graduation Score",
      "ציון סיום",
      false,
      "WARNING",
      "Graduation score cannot be calculated yet. Complete all course grades, seminar papers, and referat.",
      "ציון הסיום לא ניתן לחישוב עדיין. השלם את כל ציוני הקורסים, עבודות הסמינריון והרפרט.",
      { score: null, required: requiredScore }
    );
  }

  const rounded = Math.round(score * 100) / 100;
  const passed = rounded >= requiredScore;

  return result(
    "PKM-013",
    "Graduation Score",
    "ציון סיום",
    passed,
    passed ? "INFO" : "ERROR",
    passed
      ? `Graduation score is ${rounded}, above the required ${requiredScore}.`
      : `Graduation score is ${rounded}, below the required ${requiredScore}.`,
    passed
      ? `ציון הסיום הוא ${rounded}, מעל הנדרש (${requiredScore}).`
      : `ציון הסיום הוא ${rounded}, מתחת לנדרש (${requiredScore}).`,
    { score: rounded, required: requiredScore }
  );
};

// -------------------------------------------------------------------
// PKM-014: No more than 30% of courses can be failed
// -------------------------------------------------------------------

export const ruleFailureRate: RegulationRule = (ctx: RuleContext) => {
  const maxFailureRate = ctx.programDefinition.creditRequirements.maxFailureRate;

  // Retakes are stored as separate UserCourse rows (attemptNumber), so count distinct
  // COURSES, not attempts. A course is "failed" only if none of its attempts passed —
  // otherwise a failed-then-passed course would register as a 50% failure rate by itself.
  const byCourse = new Map<
    string,
    { passed: boolean; failed: boolean; failedIds: string[] }
  >();
  for (const uc of ctx.userCourses) {
    if (
      uc.status !== "COMPLETED" &&
      uc.status !== "FAILED" &&
      uc.status !== "EXEMPT"
    ) {
      continue;
    }
    const entry = byCourse.get(uc.courseId) ?? {
      passed: false,
      failed: false,
      failedIds: [],
    };
    if (uc.status === "COMPLETED" || uc.status === "EXEMPT") entry.passed = true;
    if (uc.status === "FAILED") {
      entry.failed = true;
      entry.failedIds.push(uc.id);
    }
    byCourse.set(uc.courseId, entry);
  }

  const distinctCourses = [...byCourse.values()];
  const totalAttempted = distinctCourses.length;
  const failedOnly = distinctCourses.filter((c) => c.failed && !c.passed);
  const failedCount = failedOnly.length;
  const failedCourses = failedOnly.flatMap((c) => c.failedIds);

  if (totalAttempted === 0) {
    return result(
      "PKM-014",
      "Failure Rate Limit",
      "מגבלת שיעור כישלון",
      true,
      "INFO",
      "No completed or failed courses yet.",
      "אין קורסים שהושלמו או נכשלו עדיין.",
      { failedCount: 0, totalAttempted: 0, failureRate: 0, maxFailureRate }
    );
  }

  const failureRate = failedCount / totalAttempted;
  const passed = failureRate <= maxFailureRate;
  const ratePercent = Math.round(failureRate * 100);

  return result(
    "PKM-014",
    "Failure Rate Limit",
    "מגבלת שיעור כישלון",
    passed,
    passed ? "INFO" : "WARNING",
    passed
      ? `Failure rate is ${ratePercent}% (${failedCount}/${totalAttempted}), within the ${Math.round(maxFailureRate * 100)}% limit.`
      : `Failure rate is ${ratePercent}% (${failedCount}/${totalAttempted}), exceeds the ${Math.round(maxFailureRate * 100)}% limit.`,
    passed
      ? `שיעור כישלון ${ratePercent}% (${failedCount}/${totalAttempted}), בטווח המותר של ${Math.round(maxFailureRate * 100)}%.`
      : `שיעור כישלון ${ratePercent}% (${failedCount}/${totalAttempted}), חורג מהמגבלה של ${Math.round(maxFailureRate * 100)}%.`,
    { failedCount, totalAttempted, failureRate: ratePercent, maxFailureRate: Math.round(maxFailureRate * 100) },
    failedCourses
  );
};

// -------------------------------------------------------------------
// PKM-015: Maximum 3 attempts per course
// -------------------------------------------------------------------

export const ruleMaxAttempts: RegulationRule = (ctx: RuleContext) => {
  const maxAttempts = ctx.programDefinition.creditRequirements.maxExamAttempts;

  // Group courses by courseId and find the max attempt number
  const attemptMap = new Map<string, { maxAttempt: number; courseCode: string; userCourseIds: string[] }>();

  for (const uc of ctx.userCourses) {
    const existing = attemptMap.get(uc.courseId);
    if (existing) {
      existing.maxAttempt = Math.max(existing.maxAttempt, uc.attemptNumber);
      existing.userCourseIds.push(uc.id);
    } else {
      attemptMap.set(uc.courseId, {
        maxAttempt: uc.attemptNumber,
        courseCode: uc.course.code,
        userCourseIds: [uc.id],
      });
    }
  }

  const violations: { courseCode: string; attempts: number; userCourseIds: string[] }[] = [];

  for (const [, entry] of attemptMap) {
    if (entry.maxAttempt > maxAttempts) {
      violations.push({
        courseCode: entry.courseCode,
        attempts: entry.maxAttempt,
        userCourseIds: entry.userCourseIds,
      });
    }
  }

  const passed = violations.length === 0;
  const affectedIds = violations.flatMap((v) => v.userCourseIds);

  return result(
    "PKM-015",
    "Maximum Attempts Per Course",
    "מספר ניסיונות מרבי לקורס",
    passed,
    passed ? "INFO" : "ERROR",
    passed
      ? `All courses are within the ${maxAttempts}-attempt limit.`
      : `${violations.length} course(s) exceed the ${maxAttempts}-attempt limit: ${violations.map((v) => `${v.courseCode} (${v.attempts} attempts)`).join(", ")}.`,
    passed
      ? `כל הקורסים בטווח המותר של ${maxAttempts} ניסיונות.`
      : `${violations.length} קורס/ים חורגים ממגבלת ${maxAttempts} ניסיונות: ${violations.map((v) => `${v.courseCode} (${v.attempts} ניסיונות)`).join(", ")}.`,
    { maxAttempts, violations: violations.map((v) => ({ courseCode: v.courseCode, attempts: v.attempts })) },
    affectedIds
  );
};

// -------------------------------------------------------------------
// PKM-023: Second failure in the SAME course = cannot continue (BLOCKING)
// -------------------------------------------------------------------
// Domain rules §4: a student may retake a failed mandatory course once; a
// SECOND failure in the same course means they cannot continue in PPE. We
// group userCourses by courseId, count attempts with status FAILED, and ERROR
// when any course has ≥ MAX_FAILURES_SAME_COURSE (2) failed attempts.

export const ruleFailTwice: RegulationRule = (ctx: RuleContext) => {
  const maxFailures = GRADE_REQUIREMENTS.MAX_FAILURES_SAME_COURSE; // 2

  // Count FAILED attempts per course.
  const failuresByCourse = new Map<
    string,
    { count: number; courseCode: string; userCourseIds: string[] }
  >();

  for (const uc of ctx.userCourses) {
    if (uc.status !== "FAILED") continue;
    const entry = failuresByCourse.get(uc.courseId) ?? {
      count: 0,
      courseCode: uc.course.code,
      userCourseIds: [],
    };
    entry.count += 1;
    entry.userCourseIds.push(uc.id);
    failuresByCourse.set(uc.courseId, entry);
  }

  const violations = [...failuresByCourse.values()].filter(
    (e) => e.count >= maxFailures
  );
  const passed = violations.length === 0;
  const affectedIds = violations.flatMap((v) => v.userCourseIds);

  return result(
    "PKM-023",
    "Repeated Course Failure",
    "כישלון חוזר בקורס",
    passed,
    // Blocking: a second failure in the same course stops continuation.
    passed ? "INFO" : "ERROR",
    passed
      ? `No course has been failed ${maxFailures} or more times.`
      : `${violations.length} course(s) failed ${maxFailures}+ times — cannot continue in PPE: ${violations
          .map((v) => `${v.courseCode} (${v.count}×)`)
          .join(", ")}.`,
    passed
      ? `אין קורס שנכשל בו ${maxFailures} פעמים או יותר.`
      : `${violations.length} קורס/ים נכשלו ${maxFailures} פעמים או יותר — לא ניתן להמשיך בפכ״מ: ${violations
          .map((v) => `${v.courseCode} (${v.count} כשלונות)`)
          .join(", ")}.`,
    {
      maxFailures,
      violations: violations.map((v) => ({ courseCode: v.courseCode, failures: v.count })),
    },
    affectedIds
  );
};

// -------------------------------------------------------------------
// PKM-026: Retake advisory — the CONVERSATIONAL layers of note #30
// -------------------------------------------------------------------
// Approved modeling (docs/המלצות-בעלים-11.7.md): nothing blocks, everything
// talks. Layer 1 — a first failure carries an INFO note that re-registering
// needs teaching-committee approval. Layer 2 — a PLANNED/IN_PROGRESS retake
// of a once-failed course gets a WARNING: this is the second and LAST
// attempt per the regulations. (Layer 3, two failures = ERROR, is PKM-023.)

export const ruleRetakeAdvisory: RegulationRule = (ctx: RuleContext) => {
  // Group by courseId: failed count + whether a retake row is planned/running.
  const byCourse = new Map<
    string,
    { failed: number; retakePlanned: boolean; resolved: boolean; courseCode: string; nameHe: string; ids: string[] }
  >();
  for (const uc of ctx.userCourses) {
    const entry = byCourse.get(uc.courseId) ?? {
      failed: 0,
      retakePlanned: false,
      resolved: false,
      courseCode: uc.course.code,
      nameHe: uc.course.nameHe,
      ids: [],
    };
    if (uc.status === "FAILED") {
      entry.failed += 1;
      entry.ids.push(uc.id);
    } else if (uc.status === "PLANNED" || uc.status === "IN_PROGRESS") {
      entry.retakePlanned = true;
      entry.ids.push(uc.id);
    } else if (uc.status === "COMPLETED" || uc.status === "EXEMPT") {
      // A successful retake closes the story — no advisory needed.
      entry.resolved = true;
    }
    byCourse.set(uc.courseId, entry);
  }

  // Exactly-one failure only — two+ failures belong to PKM-023's ERROR.
  const secondAttempts = [...byCourse.values()].filter((e) => e.failed === 1 && e.retakePlanned && !e.resolved);
  const firstFailures = [...byCourse.values()].filter((e) => e.failed === 1 && !e.retakePlanned && !e.resolved);

  if (secondAttempts.length > 0) {
    return result(
      "PKM-026",
      "Second (final) attempt planned",
      "ניסיון שני — אחרון לפי התקנון",
      false,
      "WARNING",
      `${secondAttempts.length} course(s) planned as a SECOND attempt after a failure — the last allowed try (${secondAttempts
        .map((e) => e.courseCode)
        .join(", ")}). Registration needs teaching-committee approval; another failure means leaving PPE. Consider a lighter semester around it.`,
      `${secondAttempts.length === 1 ? "קורס אחד מתוכנן" : `${secondAttempts.length} קורסים מתוכננים`} כניסיון שני אחרי כישלון — הניסיון האחרון לפי התקנון (${secondAttempts
        .map((e) => e.nameHe)
        .join(", ")}). הרישום דורש אישור ועדת-הוראה, וכישלון נוסף משמעו הפסקת לימודים בפכ״מ — שווה לתכנן סמסטר מקל סביבו.`,
      { courses: secondAttempts.map((e) => e.courseCode) },
      secondAttempts.flatMap((e) => e.ids)
    );
  }

  if (firstFailures.length > 0) {
    return result(
      "PKM-026",
      "Retake needs committee approval",
      "רישום חוזר דורש אישור",
      true,
      "INFO",
      `${firstFailures.length} failed course(s) not yet retaken (${firstFailures
        .map((e) => e.courseCode)
        .join(", ")}). Re-registering for a failed mandatory course requires teaching-committee approval.`,
      `${firstFailures.length === 1 ? "קורס אחד שנכשל" : `${firstFailures.length} קורסים שנכשלו`} וטרם נרשמתם אליו מחדש (${firstFailures
        .map((e) => e.nameHe)
        .join(", ")}). רישום חוזר לקורס חובה שנכשל דורש אישור ועדת-הוראה — פונים למזכירות החוג.`,
      { courses: firstFailures.map((e) => e.courseCode) },
      firstFailures.flatMap((e) => e.ids)
    );
  }

  return result(
    "PKM-026",
    "Retake advisory",
    "רישום חוזר",
    true,
    "INFO",
    "No failed courses awaiting a retake decision.",
    "אין קורסים שנכשלו וממתינים להחלטת רישום-חוזר.",
    {},
    []
  );
};
