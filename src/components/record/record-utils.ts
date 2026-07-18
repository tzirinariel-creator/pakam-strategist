/** Is a catalog course taught in English? Mirrors step-history's heuristic. */
export function isEnglishCourse(course: { courseType: string; nameHe?: string | null; nameEn?: string | null }): boolean {
  if (course.courseType === "ENGLISH") return true;
  const hay = `${course.nameHe ?? ""} ${course.nameEn ?? ""}`.toLowerCase();
  return hay.includes("אנגלית") || /\benglish\b/.test(hay);
}
