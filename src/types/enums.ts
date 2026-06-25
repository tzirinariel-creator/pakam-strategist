// =========================================
// Shared Enums — mirroring Prisma enums
// =========================================
// These are used on both client and server.
// Keep in sync with prisma/schema.prisma.

/**
 * Discipline identifier — dynamic string.
 * Validated at runtime against ProgramDefinition.disciplines[].id.
 * PPE examples: "PHILOSOPHY", "ECONOMICS", "POLITICAL_SCIENCE", "LAW", "PPE_CORE", "GENERAL"
 */
export type Discipline = string;

export type CourseType =
  | "MANDATORY"
  | "ELECTIVE"
  | "SEMINAR"
  | "PRACTICE"
  | "ENGLISH"
  | "LAW_FOUNDATION";

export type CourseStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "EXEMPT";

export type SubmissionType =
  | "PAPER"
  | "REFERAT"
  | "EXAM"
  | "NONE";

export type Semester =
  | "FALL"
  | "SPRING"
  | "SUMMER";

export type CalendarEventType =
  | "LECTURE"
  | "EXAM"
  | "ASSIGNMENT_DUE"
  | "STUDY_BLOCK"
  | "OFFICE_HOURS"
  | "CUSTOM"
  | "GOOGLE_SYNCED";

export type RuleSeverity =
  | "ERROR"
  | "WARNING"
  | "INFO";

export type DayOfWeek =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY";
