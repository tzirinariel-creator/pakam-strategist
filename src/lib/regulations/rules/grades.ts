import type { RuleContext, RegulationRule } from "@/types/regulation";
import { GRADE_REQUIREMENTS } from "@/lib/constants";
import { result } from "./_result";
import { heNoun } from "@/lib/he-count";

// -------------------------------------------------------------------
// PKM-013: Graduation score >= 60 (passing grade)
// -------------------------------------------------------------------

export const ruleGraduationScore: RegulationRule = (ctx: RuleContext) => {
  const requiredScore = ctx.programDefinition.creditRequirements.graduationMinScore;
  const score = ctx.gradeBreakdown.weightedScore;

  if (score === null) {
    // Not-yet-computable is NORMAL mid-degree progress (the weighted final needs
    // course-avg AND seminar-paper AND referat — only near graduation). This is
    // the SAME on-track-but-incomplete state the credit/seminar accumulation
    // rules model as passing INFO — so it must NOT be a failing WARNING that
    // lands in the red "דורש טיפול" band and tells an on-track student to "take
    // action" on something impossible to complete now (audit 22.7 — matches the
    // codebase's own "a fresh student is never painted red" philosophy).
    return result(
      "PKM-013",
      "Graduation Score",
      "ציון סיום",
      true,
      "INFO",
      "Your final graduation score is computed once course, seminar-paper, and referat grades are all in — near the end of the degree.",
      "ציון הסיום המשוקלל מחושב כשכל ציוני הקורסים, עבודות הסמינריון והרפרט קיימים — לקראת סוף התואר. אין כאן מה לעשות עכשיו.",
      { score: null, required: requiredScore }
    );
  }

  const rounded = Math.round(score * 100) / 100;
  const meetsScore = rounded >= requiredScore;

  // weightedScore turns non-null the moment there's a course average + ONE
  // seminar paper + ONE referat — which can happen in year 2, long before the
  // score is FINAL. A provisional score below 60 must NOT paint a red
  // degree-ending block; only once the degree is essentially complete (all
  // credits in) is the score final and a shortfall a real problem (launch audit
  // 24.7). Until then it's shown as an on-track forecast (INFO).
  const totalTarget = ctx.programDefinition.creditRequirements.total;
  const creditsEssentiallyDone =
    ctx.creditBreakdown.earned + ctx.creditBreakdown.miluimExemption >= totalTarget;
  const isFinalScore = creditsEssentiallyDone;
  const compliant = meetsScore || !isFinalScore;

  return result(
    "PKM-013",
    "Graduation Score",
    "ציון סיום",
    compliant,
    compliant ? "INFO" : "ERROR",
    meetsScore
      ? `Graduation score is ${rounded}, above the required ${requiredScore}.`
      : isFinalScore
        ? `Graduation score is ${rounded}, below the required ${requiredScore}.`
        : `Provisional graduation score so far is ${rounded}. It's a forecast — the final score is set once all grades are in.`,
    meetsScore
      ? `ציון הסיום הוא ${rounded}, מעל הנדרש (${requiredScore}).`
      : isFinalScore
        ? `ציון הסיום הוא ${rounded}, מתחת לנדרש (${requiredScore}).`
        : `ציון הסיום המשוער עד כה הוא ${rounded} — זו תחזית בלבד. הציון הסופי נקבע כשכל הציונים ייכנסו, אין כאן מה לתקן עכשיו.`,
    { score: rounded, required: requiredScore, isFinal: isFinalScore }
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
    { passed: boolean; failed: boolean; attempted: boolean; failedIds: string[] }
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
      attempted: false,
      failedIds: [],
    };
    if (uc.status === "COMPLETED" || uc.status === "EXEMPT") entry.passed = true;
    // An EXEMPT course was NOT sat — it must not inflate the failure-rate
    // denominator (audit 22.7). Only COMPLETED/FAILED count as attempts.
    if (uc.status === "COMPLETED" || uc.status === "FAILED") entry.attempted = true;
    if (uc.status === "FAILED") {
      entry.failed = true;
      entry.failedIds.push(uc.id);
    }
    byCourse.set(uc.courseId, entry);
  }

  const distinctCourses = [...byCourse.values()];
  const totalAttempted = distinctCourses.filter((c) => c.attempted).length;
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
  const ratePercent = Math.round(failureRate * 100);

  // NO VERDICT. `maxFailureRate` (0.3) has NO source: there is no
  // failure-rate rule in docs/pakam-domain-rules-2026.md, in דומיין-עומק, or
  // anywhere else in docs/ — the only "30%" in the docs is about JS bundle
  // size. This rule used to tell a student "שיעור כישלון 33%, חורג מהמגבלה של
  // 30%", i.e. assert a regulation violation against an invented number, which
  // the project's iron rule forbids outright.
  //
  // The RATE itself is real — it is the student's own record — so it is still
  // reported, as a fact with no limit attached. The rule that actually binds
  // failures IS sourced and IS implemented: PKM-023 (§4, a second failure in
  // the same course means you cannot continue), which fires as a blocking
  // ERROR. Nothing is lost by removing this one's fake verdict.
  //
  // If a real faculty failure-rate cap is ever found, put the citation in
  // docs/ and restore the verdict here — not before.
  return result(
    "PKM-014",
    "Failure Rate",
    "שיעור כישלון",
    true,
    "INFO",
    `Failure rate is ${ratePercent}% (${failedCount} of ${totalAttempted} courses). Informational — we have no sourced faculty limit for this.`,
    `שיעור הכישלון שלכם: ${ratePercent}% (${failedCount} מתוך ${heNoun(totalAttempted, "קורס", "קורסים")}). זה מידע בלבד — אין לנו מקור רשמי למגבלה על שיעור כישלון. הכלל שכן קיים הוא כישלון שני באותו קורס (ראו מטה).`,
    { failedCount, totalAttempted, failureRate: ratePercent },
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

  const affectedIds = violations.flatMap((v) => v.userCourseIds);

  // NO VERDICT, same reason as PKM-014. `maxExamAttempts` (3) has no source,
  // and it is also the WRONG QUANTITY: §4 governs FAILURES, not attempts, and
  // §6 Layer A speaks of exam SITTINGS ("2 of 3 מועדים"), which is a different
  // thing again. Firing a blocking ERROR at "4 attempts" invented both the
  // number and the rule.
  //
  // Critically, the real rule is NOT missing — PKM-023 implements §4 exactly
  // (a second failure in the same course = cannot continue) and fires as a
  // blocking ERROR at the right threshold. This rule was, at best, noise
  // layered on top of it, and at worst a false alarm for a student who
  // legitimately retook a course.
  return result(
    "PKM-015",
    "Attempts Per Course",
    "מספר ניסיונות בקורס",
    true,
    "INFO",
    violations.length === 0
      ? "No course has an unusual number of attempts."
      : `Courses with several attempts: ${violations.map((v) => `${v.courseCode} (${v.attempts})`).join(", ")}. Informational — the binding rule is a second failure in the same course.`,
    violations.length === 0
      ? "אין קורס עם מספר ניסיונות חריג."
      : `קורסים עם כמה ניסיונות: ${violations.map((v) => `${v.courseCode} (${v.attempts})`).join(", ")}. זה מידע בלבד — הכלל שמחייב הוא כישלון שני באותו קורס.`,
    { violations: violations.map((v) => ({ courseCode: v.courseCode, attempts: v.attempts })) },
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
    // Domain rules §4 scope this to MANDATORY courses only — a failed elective
    // is simply replaced by another elective, never a degree-ending block. A
    // twice-failed elective must not paint the red "cannot continue" blocker
    // (launch audit 24.7).
    if (uc.status !== "FAILED" || !uc.course.isMandatory) continue;
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
    // Same scope as PKM-023: the "last allowed attempt / leaving PPE" warning
    // only applies to MANDATORY courses — failing an elective again just means
    // picking a different elective (launch audit 24.7).
    if (!uc.course.isMandatory) continue;
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
      `${firstFailures.length === 1 ? "קורס אחד שנכשל" : `${heNoun(firstFailures.length, "קורס", "קורסים")} שנכשלו`} וטרם נרשמתם אליו מחדש (${firstFailures
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
