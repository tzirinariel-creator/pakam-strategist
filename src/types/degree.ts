// =========================================
// Degree Planning Types
// =========================================

import type { Discipline, CourseType, CourseStatus, SubmissionType, Semester } from "./enums";

export interface Course {
  id: string;
  code: string;
  nameHe: string;
  nameEn: string | null;
  discipline: Discipline;
  courseType: CourseType;
  credits: number;
  yearOffered: number[];
  semesterOffered: Semester[];
  prerequisites: string[]; // Course codes
  canCountAs: Discipline[]; // Alternative discipline attributions
  description: string | null;
  isMandatory: boolean;
  submissionType: SubmissionType;
  weeklyHours: number | null;
  examDateA: Date | null;
  examDateB: Date | null;
  averageGrade: number | null;
  difficultyLevel: string | null;
  failRate: number | null;
}

export interface UserCourse {
  id: string;
  userId: string;
  courseId: string;
  status: CourseStatus;
  grade: number | null;
  plannedYear: number;
  plannedSemester: Semester;
  attemptNumber: number;
  isGradeImproved: boolean;
  disciplineOverride: Discipline | null; // For cross-discipline attribution
  submissionType: SubmissionType | null;
  submissionGrade: number | null;
  notes: string | null;
}

export interface UserCourseWithCourse extends UserCourse {
  course: Course;
}

export interface SeminarInfo {
  userCourseId: string;
  courseCode: string;
  courseName: string;
  discipline: Discipline;
  submissionType: SubmissionType;
  plannedYear: number;
  grade: number | null;
}

export interface CreditBreakdown {
  total: number;
  /** Credits from courses with status COMPLETED */
  earned: number;
  /** Credits from courses with status PLANNED */
  planned: number;
  mandatory: number;
  elective: number;
  /** SEMINAR credits — their own bucket (12 ש"ס), NOT counted as electives. */
  seminar: number;
  practice: number;
  byDiscipline: DisciplineCredits;
  focusArea: number;
  focusAreaTarget: number;
  english: number;
  englishCourseCount: number;
  /** Miluim credit exemption: total ש"ס exempted based on group and years in program */
  miluimExemption: number;
  /** Effective total: total + miluimExemption (for progress calculation) */
  effectiveTotal: number;
}

/**
 * Credits per discipline — dynamic record.
 * Keys are discipline IDs from ProgramDefinition (e.g., "PHILOSOPHY", "ECONOMICS").
 * Replaces the old fixed interface to support any degree program.
 */
export type DisciplineCredits = Record<string, number>;

export interface DegreePlan {
  userId: string;
  focusArea: Discipline | null;
  courses: UserCourseWithCourse[];
  semesters: SemesterSlot[];
  creditBreakdown: CreditBreakdown;
  gradeBreakdown: GradeBreakdown;
  graduationScore: number | null;
}

export interface SemesterSlot {
  year: number;
  semester: Semester;
  courses: UserCourseWithCourse[];
  totalCredits: number;
}

export interface GradeBreakdown {
  courseAverage: number | null;
  seminarPaperAverage: number | null;
  referatGrade: number | null;
  weightedScore: number | null;
  completedCredits: number;
  totalGradedCourses: number;
}
