// =========================================
// Arazim Project — Public API
// =========================================

export { fetchGrades } from "./fetcher";
export { ARAZIM_ENABLED, arazimView, arazimVisible, type ArazimGradeFields } from "./visibility";
export { enrichCoursesWithGrades, computeDifficulty, dbCodeToArazim, arazimCodeToDb } from "./enricher";
export type {
  ArazimGradesData,
  ArazimCourseGrades,
  ArazimMoedEntry,
  CourseGradeSummary,
  EnrichmentResult,
} from "./types";
