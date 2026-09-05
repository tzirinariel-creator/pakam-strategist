// =========================================
// Shared AI Context Builder
// =========================================
// Builds the MentorContext from a user's plan data.
// Used by both the tRPC ai router and the streaming chat API route.

import type {
  MentorContext,
  RegulationIssue,
  CourseInfo,
} from "@/lib/ai/mentor-prompt";
import type { UserCourseWithCourse } from "@/types/degree";
import type { Semester } from "@/types/enums";
import type { MiluimGroup } from "@prisma/client";
import type { Db } from "@/lib/db";
import { calculateCredits } from "@/lib/credit-calculator";
import { greetNameForLocale } from "@/lib/personal-address";
import { calculateGrades } from "@/lib/grade-calculator";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { computeCreditExemption, deriveCurrentGroup, getCurrentAcademicYear, prefersHigherGrade, binaryBenefitOf, binaryCapRemaining, type MiluimGroupKey } from "@/lib/miluim";
import { rankBinaryCandidates } from "@/lib/binary-advisor";
import { arazimView } from "@/lib/arazim/visibility";
import { buildExamPeriodBlock } from "@/lib/ai/exam-facts";
import { getProgramById } from "@/lib/programs/registry";
import { getAcademicNow, getPlanningAnchor, deriveYearOfStudy } from "@/lib/academic-calendar";
import { israelCivilDate } from "@/lib/civil-day";

// Defense-in-depth against the foreign TAU law-school catalog (0910-xxxx) that
// was co-seeded into the shared Course table and hides under the shared
// "GENERAL" discipline — so the discipline scope alone doesn't catch it. The
// King must never recommend a non-PPE course even if the prod-DB cleanup
// (prisma/cleanup-nonppe-courses.ts) has not run. IMPORTANT: 0910-1000
// ("דיני איכות סביבה") is the ONE 0910 course that genuinely belongs to the PPE
// catalog (law-foundation basket, present in ppe-courses-2025.json), so it is
// explicitly preserved. Exported for its regression test.
export function isForeignLawCourseCode(code: string): boolean {
  return code.startsWith("0910-") && code !== "0910-1000";
}

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

/** Shape of a single stored message in ChatSession.messages (Json[]). */
export interface StoredMessage {
  role: string;
  content: string;
  timestamp: string;
}

/** Minimal user info needed to build context. */
export interface UserForContext {
  id: string;
  focusArea: string | null;
  currentYear: number;
  currentSemester: string;
  /** Program membership — scopes the King's course list to this program's
   *  disciplines so a PPE student is never offered another program's courses. */
  programId?: string | null;
  /** The degree-start anchor — lets the context derive standing from the
   *  calendar (A4), matching the dashboard. Optional for back-compat. */
  startYear?: number | null;
  /** Personal address — so the King greets by name and in the right gender. */
  firstName?: string | null;
  displayName?: string | null;
  gender?: string | null;
  /** AMIRANT English placement score (DB column kept as amiramScore). */
  amiramScore?: number | null;
  /** #23 — the DECLARED English level (grade sheet); overrides the score. */
  englishLevel?: string | null;
  /** Miluim fields — so the mentor's credit total + regulation list match the
   *  dashboard hero exactly (#19). Optional: absent → NONE / 0 (no change). */
  miluimGroup?: MiluimGroup | string | null;
  miluimCreditsUsed?: number;
  miluimBinaryUsed?: number;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Auto-generate a title from the first user message (first 60 chars).
 */
export function generateTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "...";
}

// -------------------------------------------------------------------
// Context builder
// -------------------------------------------------------------------

/**
 * The prerequisite codes a student has not completed yet — as an ADVISORY
 * ordering hint, never a gate.
 *
 * PPE students are formally EXEMPT from course prerequisites (ידיעון note 19,
 * quoted in docs/pakam-domain-rules-2026.md §9b: "תלמידי פכ״ם אינם מחוייבים
 * בדרישות הקדם"), and that doc names a hard prereq gate as a BUG for this
 * program. The King's course list used to be `.filter(prereqs.every(completed))`,
 * which silently deleted every course with an unmet prereq from the advisor's
 * context — in practice the entire economics mandatory chain (מיקרו א׳/ב׳/ג׳,
 * מאקרו, אקונומטריקה) plus סמינר פכ״מ ב׳. A first-year asking "what should I take
 * next semester?" was never told about courses they may legally register for.
 *
 * The signal is worth keeping, so it is kept — as data on the course ("worth
 * doing X first"), not as a reason to hide it. Mirrors what the planner already
 * does (batch-course-select.courseFit keeps such a course selectable and shows
 * "מומלץ לפני כן").
 *
 * Returns undefined when nothing is outstanding, so the prompt stays silent.
 */
export function prereqAdvisoryFor(
  prerequisites: string[] | null | undefined,
  completedCodes: ReadonlySet<string>,
): string[] | undefined {
  const missing = (prerequisites ?? []).filter((code) => !completedCodes.has(code));
  return missing.length > 0 ? missing : undefined;
}

function mapToCourseInfo(
  uc: UserCourseWithCourse,
  includeGrade: boolean,
): CourseInfo {
  return {
    code: uc.course.code,
    nameHe: uc.course.nameHe,
    discipline: uc.disciplineOverride ?? uc.course.discipline,
    credits: uc.course.credits,
    // WHEN the student filed it. These are already on the row and were being
    // dropped here, which is how the saved plan reached the model as one flat
    // list spanning the whole degree. (#22/#55)
    plannedYear: uc.plannedYear,
    plannedSemester: uc.plannedSemester,
    ...(includeGrade && { grade: uc.grade }),
    // Arazim gate: the King never cites external historical averages/difficulty
    // when Arazim is off ("בלי ארזים כרגע"). arazimView returns nulls, so these
    // facts are simply omitted from the prompt (mentor-prompt gates on non-null).
    ...(() => {
      const av = arazimView(uc.course);
      return {
        averageGrade: av.averageGrade,
        difficultyLevel: av.difficultyLevel,
        failRate: av.failRate,
      };
    })(),
  };
}

/**
 * Build a MentorContext from the user's current plan data.
 * Works with any Prisma-like DB client.
 */
export async function buildUserContext(
  db: Db,
  user: UserForContext,
): Promise<MentorContext> {
  const userCourses = (await db.userCourse.findMany({
    where: { userId: user.id },
    include: { course: true },
  })) as unknown as UserCourseWithCourse[];

  // The saved exam-period plan (#15) — lets the advisor plan WITH the student
  // instead of inventing dates. Tiny select; negligible at this user count.
  const studyTasks = await db.studyTask.findMany({
    where: { userId: user.id },
    select: {
      taskType: true,
      startDate: true,
      notes: true,
      courseCode: true,
      title: true,
      color: true,
    },
  });

  // Resolve the miluim credit exemption EXACTLY like plan.getCredits /
  // regulation.checkCompliance so the mentor's numbers match the dashboard (#19).
  // academicYear for deriveCurrentGroup is the calendar-year key the rows were
  // written with (getCurrentAcademicYear), NOT user.currentYear (standing 1–4).
  const miluimSemesters = await db.miluimSemester.findMany({
    where: { userId: user.id },
  });
  const currentGroup = deriveCurrentGroup(
    miluimSemesters,
    (user.miluimGroup ?? "NONE") as MiluimGroup,
    // Real-time semester (calendar source-of-truth), matching the client miluim
    // surfaces and plan.getCredits — not the stored, possibly-stale value (#audit-r2).
    { academicYear: getCurrentAcademicYear(), semester: getAcademicNow().semester as Semester },
  );
  const miluimExemption = computeCreditExemption(currentGroup, user.miluimCreditsUsed ?? 0);

  const creditResult = calculateCredits(userCourses, user.focusArea, miluimExemption);
  // The grade "higher counts" rule uses the RAW stored group — the SAME source
  // /record, /graduation and getGraduationScore use — NOT the derived
  // currentGroup (which is only for the credit exemption above). Otherwise a
  // reservist whose current semester derives a different group would hear the
  // King quote a GPA that contradicts every other screen (audit 24.7).
  const gradeResult = calculateGrades(userCourses, {
    preferHigherGrade: prefersHigherGrade((user.miluimGroup ?? "NONE") as MiluimGroupKey),
  });

  // Standing derived from the calendar anchor, never the fossilized stored
  // pair — in October the stored year is one behind until the profile is
  // touched, and the stored semester can lag a whole season (spirit 14.7).
  const derivedYear = deriveYearOfStudy(user.startYear, user.currentYear);
  const liveSemester = getAcademicNow().semester;

  const regulationSummary = runRegulationEngine(
    userCourses,
    user.focusArea,
    miluimExemption,
    undefined,
    {
      amirantScore: user.amiramScore ?? null,
      // #23 — the declared level must reach the rule engine here too, or the
      // King's regulation list diverges from the dashboard's.
      englishLevel: user.englishLevel ?? null,
      academicYear: derivedYear,
      currentSemester: liveSemester,
      miluimGroup: currentGroup,
      miluimBinaryUsed: user.miluimBinaryUsed,
      miluimCreditsUsed: user.miluimCreditsUsed,
    },
  );

  const regulationIssues: RegulationIssue[] = regulationSummary.results
    .filter((r) => !r.passed)
    .map((r) => ({
      ruleId: r.ruleId,
      severity: r.severity as "ERROR" | "WARNING" | "INFO",
      messageHe: r.messageHe,
    }));

  const completedCourses: CourseInfo[] = userCourses
    .filter((uc) => uc.status === "COMPLETED")
    .map((uc) => mapToCourseInfo(uc, true));

  const currentCourses: CourseInfo[] = userCourses
    .filter((uc) => uc.status === "IN_PROGRESS")
    .map((uc) => mapToCourseInfo(uc, false));

  // What the student actually saved. PLANNED is the status savePlan writes,
  // and it was missing from the context entirely — so the King could not see
  // a plan the student had just finished building, and said so out loud.
  const plannedCourses: CourseInfo[] = userCourses
    .filter((uc) => uc.status === "PLANNED")
    .map((uc) => mapToCourseInfo(uc, false));

  const currentSemesterCredits = userCourses
    .filter(
      (uc) =>
        uc.plannedSemester === liveSemester &&
        uc.plannedYear === derivedYear &&
        (uc.status === "IN_PROGRESS" || uc.status === "PLANNED"),
    )
    .reduce((sum, uc) => sum + uc.course.credits, 0);

  const completedCodes = new Set<string>(
    userCourses
      .filter((uc) => uc.status === "COMPLETED" || uc.status === "IN_PROGRESS")
      .map((uc) => uc.course.code),
  );

  const allUserCourseCodes = new Set<string>(
    userCourses.map((uc) => uc.course.code),
  );

  // The "next semester" the King recommends FOR is the PLANNING ANCHOR — the
  // next TEACHING semester at ITS study-year. getNextSemester's SPRING→SUMMER
  // hop left availableNextSemester EMPTY for every student from mid-April to
  // mid-October (PPE offers no summer courses), so the flagship "מה כדאי
  // לקחת בסמסטר הבא?" starter had no grounded list at exactly the launch
  // window (launch-gate blocker, 14.7).
  const anchor = getPlanningAnchor();
  const nextSemesterInfo = {
    year: deriveYearOfStudy(user.startYear, user.currentYear, anchor.startYear),
    semester: anchor.semester as Semester,
  };

  // Scope the King's course list to the student's PROGRAM. `Course` has no
  // programId column — the only program signal is the discipline string — so a
  // PPE student must never be offered another program's courses (a real bug: the
  // King was listing TAU law-school courses to a PPE first-year, QA 13.7). Filter
  // to the program's disciplines. (Rows whose discipline is the shared "GENERAL"
  // still need the DB-level cleanup of the foreign 0910-xxxx set.)
  const program = getProgramById(user.programId ?? null);
  const programDisciplines = program.disciplines.map((d) => d.id);

  const allCourses = await db.course.findMany({
    where: {
      semesterOffered: { has: nextSemesterInfo.semester },
      isActive: true,
      discipline: { in: programDisciplines },
      // Suspenders: drop the foreign 0910-xxxx law set at the query level (kept
      // out even before it's fetched). 0910-1000 is a real PPE course, so it is
      // NOT excluded. Belt version below re-checks in JS. See isForeignLawCourseCode.
      NOT: { AND: [{ code: { startsWith: "0910-" } }, { code: { not: "0910-1000" } }] },
    },
    select: {
      code: true,
      nameHe: true,
      discipline: true,
      credits: true,
      averageGrade: true,
      difficultyLevel: true,
      failRate: true,
      prerequisites: true,
      // The YEAR each course is given in. The query already narrows to the
      // right SEMESTER, and this column was never fetched — which is why the
      // King could offer a second-year a third-year course.
      yearOffered: true,
      semesterOffered: true,
      // So the King can lead with "what's mandatory this semester" instead of
      // dumping the whole catalog (#14).
      courseType: true,
      isMandatory: true,
    },
  });

  const availableNextSemester: CourseInfo[] = allCourses
    .filter((course) => {
      // Belt: never surface a foreign law course to the King, regardless of
      // what the DB returned (guards against stale rows before cleanup).
      if (isForeignLawCourseCode(course.code)) return false;
      if (allUserCourseCodes.has(course.code)) return false;

      // Ariel, 1.9: "למה המלך ממליץ לי על קורסים לא מהסמסטר שלי?"
      //
      // Because this list, despite its name, had no year or semester filter at
      // all — it was every course in the programme the student had not already
      // taken. `nextSemesterInfo.year` was computed a few lines above and never
      // used. A second-year asking "what should I take next semester" was
      // offered third-year courses that are not even given in that term.
      //
      // Same predicate the planner uses: an empty column means "unknown", and
      // unknown is not a reason to hide a course.
      const years = course.yearOffered ?? [];
      if (years.length > 0 && !years.includes(nextSemesterInfo.year)) return false;
      const terms = (course.semesterOffered ?? []).map(String);
      if (terms.length > 0 && !terms.includes(nextSemesterInfo.semester)) return false;

      return true;
    })
    .map((course) => {
      // Arazim gate — omit external averages/difficulty for the King when off.
      const av = arazimView(course);
      return {
        code: course.code,
        nameHe: course.nameHe,
        discipline: course.discipline,
        credits: course.credits,
        averageGrade: av.averageGrade,
        difficultyLevel: av.difficultyLevel,
        failRate: av.failRate,
        isMandatory: course.courseType === "MANDATORY" || course.isMandatory === true,
        // ADVISORY ONLY — see prereqAdvisoryFor.
        recommendedAfter: prereqAdvisoryFor(course.prerequisites, completedCodes),
      };
    });

  return {
    // The term the availableNextSemester list below was filtered for. It was
    // computed a hundred lines up to DO that filtering and then discarded, so
    // the prompt named the student's current term and printed a list for a
    // different one. (#22/#55)
    nextSemester: { year: nextSemesterInfo.year, semester: nextSemesterInfo.semester },
    plannedCourses,
    // The mentor prompt is Hebrew, so guard the greeting name by script: a
    // Google-auth user whose only name is a Latin displayName ("Ariel") returns
    // null → the King uses a generic greeting instead of jamming "Ariel" into
    // Hebrew (#8). A real Hebrew name ("אריאל") passes through.
    firstName: greetNameForLocale(user, true),
    gender: user.gender === "male" || user.gender === "female" ? user.gender : null,
    focusArea: user.focusArea as MentorContext["focusArea"],
    // effectiveTotal (credits + miluim exemption) — the same figure the "My
    // status" hero headlines, so the mentor narrates the same number (#19).
    totalCredits: creditResult.breakdown.effectiveTotal,
    earnedCredits: creditResult.earnedCredits,
    courseAverage: gradeResult.courseAverage,
    focusAreaCredits: creditResult.breakdown.focusArea,
    regulationIssues,
    // A4: derive from the calendar (like the dashboard) so the King never
    // disagrees with the header about what year/semester it is. The stored
    // pair is only a fallback for a user with no startYear.
    currentYear: deriveYearOfStudy(user.startYear, user.currentYear ?? 1),
    currentSemester: getAcademicNow().semester,
    completedCourses,
    currentCourses,
    availableNextSemester,
    currentSemesterCredits,
    // The sub-breakdown the free engine already answers with — keeps the LLM
    // quantitatively at parity (elective/mandatory/seminar questions).
    creditDetail: {
      planned: creditResult.breakdown.planned,
      mandatory: creditResult.breakdown.mandatory,
      elective: creditResult.breakdown.elective,
      seminar: creditResult.breakdown.seminar,
      englishCourseCount: creditResult.breakdown.englishCourseCount,
    },
    examPeriodBlock: buildExamPeriodBlock(studyTasks, israelCivilDate()),
    academicNowLine: buildAcademicNowLine(),
    // =====================================================================
    // המרה בינארית — המספרים, לא ההערכה של המודל (אריאל, 5.9)
    // =====================================================================
    // ההערה: *"יש פה טעות למלך בחישוב ממוצע — תסדר את זה ותוודא שלמלך אין
    // הזיות בכלל כי זה פוגע באמון."* וזה בדיוק מה שקרה, מול צילום מסך.
    //
    // הכפתור "מה כדאי לשקול?" ב-BinaryAdvisor שולח למלך משפט עם המספר
    // **הנכון** שהאפליקציה חישבה ("הממוצע יעלה ל-96.8"). המלך ענה שההמרה
    // *תוריד* את הממוצע "מ-96.4 ל-96.2, משום שציון 90 גבוה מהממוצע
    // הנוכחי" — משפט שסותר את עצמו (90 נמוך מ-96.4), סותר את המסך, ומכיל
    // שלושה מספרים שאיש לא חישב.
    //
    // הסיבה: זו שאלה **היפותטית**. אף עובדה מוסמכת לא ענתה עליה, אז
    // המודל חישב לבד — וזה בדיוק מה שהפרומפט אוסר עליו לעשות. התיקון
    // הנכון אינו עוד אזהרה בפרומפט אלא לתת לו את התשובה: אותו
    // rankBinaryCandidates שמצייר את הכרטיס, כך שהמלך והמסך קוראים
    // מאותו מספר.
    binaryImpact: buildBinaryImpact(userCourses, user, currentGroup),
  };
}

/**
 * The exact arithmetic behind "what happens to my average if I convert X to
 * pass/fail" — the same engine the record screen's advisor card draws from.
 * Null when the student's group grants no binary benefit or nothing qualifies,
 * and the prompt then says the King has no figure rather than inventing one.
 */
function buildBinaryImpact(
  userCourses: UserCourseWithCourse[],
  user: { miluimGroup?: MiluimGroup | string | null; miluimBinaryUsed?: number | null },
  currentGroup: MiluimGroup,
): MentorContext["binaryImpact"] {
  if (!binaryBenefitOf(currentGroup as MiluimGroupKey)) return null;
  const quotaLeft = binaryCapRemaining(
    user.miluimBinaryUsed ?? 0,
    currentGroup as MiluimGroupKey,
  );
  const { current, candidates } = rankBinaryCandidates(userCourses, quotaLeft, {
    preferHigherGrade: prefersHigherGrade((user.miluimGroup ?? "NONE") as MiluimGroupKey),
  });
  if (current == null) return null;
  return {
    currentAverage: current,
    quotaLeft,
    candidates: candidates.slice(0, 6).map((c) => ({
      nameHe: c.course.nameHe,
      grade: c.course.grade,
      credits: c.course.credits,
      newAverage: c.newAverage,
      delta: c.delta,
    })),
  };
}

/** One honest calendar line for the system prompt — from the calendar module,
 *  never the fossilized profile pair (#39). */
function buildAcademicNowLine(): string {
  // Anchor to ISRAEL civil time — on Vercel the server runs UTC, so raw
  // new Date() getters state YESTERDAY's date/weekday during the 00:00–~03:00
  // Israel window (audit 22.7). israelCivilDate() gives local-midnight of the
  // Israel civil day, so the weekday/date the King reports match the student's.
  const now = israelCivilDate();
  const a = getAcademicNow(now);
  const sem = a.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳";
  const phase =
    a.phase === "teaching"
      ? `לימודים (מסתיימים ב-${a.dates.teachingEnd.getDate()}.${a.dates.teachingEnd.getMonth() + 1})`
      : a.phase === "exams"
        ? "תקופת בחינות"
        : a.nextTeachingStart
          ? `חופשה (הלימודים חוזרים ב-${a.nextTeachingStart.getDate()}.${a.nextTeachingStart.getMonth() + 1})`
          // Never hand the model a date we don't have — it will repeat it as fact.
          : "חופשה (מועד חזרת הלימודים טרם פורסם)";
  // THE date anchor (bug: the LLM answered "18.7.2024" to "מה התאריך היום" —
  // it had exam dates but no today, so it guessed from training data). `now` is
  // the Israel-civil day computed above.
  const weekday = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][now.getDay()];
  const today = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
  return `היום: יום ${weekday}, ${today} · ${sem} ${a.labelHe}, שלב: ${phase}`;
}
