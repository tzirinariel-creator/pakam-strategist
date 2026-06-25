// =========================================
// Pakamon — Shared Types
// =========================================

// Re-export all domain types
export type {
  Discipline,
  CourseType,
  CourseStatus,
  SubmissionType,
  Semester,
  CalendarEventType,
  RuleSeverity,
} from "./enums";

export type {
  Course,
  UserCourse,
  UserCourseWithCourse,
  SeminarInfo,
  CreditBreakdown,
  DisciplineCredits,
  DegreePlan,
  SemesterSlot,
  GradeBreakdown,
} from "./degree";

export type {
  RegulationResult,
  RegulationRule,
  RuleContext,
  RegulationSummary,
} from "./regulation";
