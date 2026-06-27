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
import type { PrismaClient } from "@prisma/client";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGrades } from "@/lib/grade-calculator";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";

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
  /** AMIRANT English placement score (DB column kept as amiramScore). */
  amiramScore?: number | null;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Determine the next semester (year, semester) given the current one.
 */
export function getNextSemester(
  currentYear: number,
  currentSemester: string,
): { year: number; semester: Semester } {
  switch (currentSemester) {
    case "FALL":
      return { year: currentYear, semester: "SPRING" };
    case "SPRING":
      return { year: currentYear, semester: "SUMMER" };
    case "SUMMER":
      return { year: currentYear + 1, semester: "FALL" };
    default:
      return { year: currentYear, semester: "SPRING" };
  }
}

/**
 * Auto-generate a title from the first user message (first 60 chars).
 */
export function generateTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "...";
}

/**
 * Extract text from Claude API response content blocks.
 */
export function extractResponseText(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("");
}

// -------------------------------------------------------------------
// Context builder
// -------------------------------------------------------------------

function mapToCourseInfo(
  uc: UserCourseWithCourse,
  includeGrade: boolean,
): CourseInfo {
  return {
    code: uc.course.code,
    nameHe: uc.course.nameHe,
    discipline: uc.disciplineOverride ?? uc.course.discipline,
    credits: uc.course.credits,
    ...(includeGrade && { grade: uc.grade }),
    averageGrade: uc.course.averageGrade,
    difficultyLevel: uc.course.difficultyLevel,
    failRate: uc.course.failRate,
  };
}

/**
 * Build a MentorContext from the user's current plan data.
 * Works with any Prisma-like DB client.
 */
export async function buildUserContext(
  db: PrismaClient,
  user: UserForContext,
): Promise<MentorContext> {
  const userCourses = (await db.userCourse.findMany({
    where: { userId: user.id },
    include: { course: true },
  })) as unknown as UserCourseWithCourse[];

  const creditResult = calculateCredits(userCourses, user.focusArea);
  const gradeResult = calculateGrades(userCourses);

  const regulationSummary = runRegulationEngine(
    userCourses,
    user.focusArea,
    0,
    undefined,
    {
      amirantScore: user.amiramScore ?? null,
      academicYear: user.currentYear,
      currentSemester: user.currentSemester,
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

  const currentSemesterCredits = userCourses
    .filter(
      (uc) =>
        uc.plannedSemester === user.currentSemester &&
        uc.plannedYear === user.currentYear &&
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

  const nextSemesterInfo = getNextSemester(
    user.currentYear,
    user.currentSemester,
  );

  const allCourses = await db.course.findMany({
    where: { semesterOffered: { has: nextSemesterInfo.semester }, isActive: true },
    select: {
      code: true,
      nameHe: true,
      discipline: true,
      credits: true,
      averageGrade: true,
      difficultyLevel: true,
      failRate: true,
      prerequisites: true,
    },
  });

  const availableNextSemester: CourseInfo[] = allCourses
    .filter((course) => {
      if (allUserCourseCodes.has(course.code)) return false;
      const prereqs = course.prerequisites ?? [];
      return prereqs.every((code) => completedCodes.has(code));
    })
    .map((course) => ({
      code: course.code,
      nameHe: course.nameHe,
      discipline: course.discipline,
      credits: course.credits,
      averageGrade: course.averageGrade,
      difficultyLevel: course.difficultyLevel,
      failRate: course.failRate,
    }));

  return {
    focusArea: user.focusArea as MentorContext["focusArea"],
    totalCredits: creditResult.totalCredits,
    earnedCredits: creditResult.earnedCredits,
    courseAverage: gradeResult.courseAverage,
    focusAreaCredits: creditResult.breakdown.focusArea,
    regulationIssues,
    currentYear: user.currentYear,
    currentSemester: user.currentSemester,
    completedCourses,
    currentCourses,
    availableNextSemester,
    currentSemesterCredits,
  };
}
