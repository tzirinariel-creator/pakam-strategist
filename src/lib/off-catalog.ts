// =========================================
// Off-catalog courses — the student's own additions
// =========================================
// A course a student takes that is NOT in OUR catalog: an external elective, a
// workshop, a course from another faculty that their degree approved for them
// personally (e.g. "דוגרי", approved for PPE but never in the PPE list).
//
// IRON RULE OF THIS MODULE — "לא בקטלוג שלנו" is NOT "לא מאושר".
// Only the מזכירות can say a course is approved for a degree, and we never
// speak on the university's behalf. What we CAN record is the STUDENT'S OWN
// DECLARATION, and label it as exactly that everywhere it shows.
//
// WHERE THE DECLARATION LIVES — no new column:
//   `UserCourse.disciplineOverride`. Non-null on an off-catalog course means
//   "the student declared this course counts toward their degree, under this
//   discipline" (GENERAL = "counts, as a general elective"). null = no
//   declaration was made. The credit engine ALREADY honors disciplineOverride
//   (`resolvedDiscipline` in credit-calculator.ts), so a declaration moves the
//   discipline / focus-area math with no extra plumbing — and because it's a
//   per-UserCourse field, one student's declaration can never leak onto
//   another student's copy of the same shared Course row.

/**
 * The stable Course.code we mint for a student-typed course that matched
 * nothing in the catalog. Derived from the NAME (never from a timestamp), so
 * re-adding the same course upserts the SAME row instead of piling up
 * duplicates — the server and the client must agree on it, which is why it
 * lives here and not inside either one.
 */
export function customCourseCode(name: string): string {
  return `CUSTOM-${name.trim().replace(/\s+/g, "-").slice(0, 24)}`;
}

/**
 * Is this course outside our shared catalog?
 *
 * `isActive: false` is how a student-added Course row is kept out of the
 * public catalog (see plan.addCustomCourses / plan.addScannedCourse). Note the
 * strict `=== false`: `Course.isActive` is optional in the client type, and an
 * UNKNOWN value must never be reported as "outside the catalog".
 */
export function isOffCatalogCourse(course: { isActive?: boolean | null }): boolean {
  return course.isActive === false;
}

/**
 * Is this a course id that actually exists in the database?
 *
 * The planner mints `custom-<uuid>` ids for courses the student types in, and
 * swaps them for real ids once the server registers them. A leftover
 * `custom-…` id therefore means "never registered" — and savePlan rejects the
 * WHOLE payload when any courseId isn't a UUID, so it has to be filtered out.
 * (Note the prefix makes a client id fail this test — that's the point.)
 */
export function isPersistedCourseId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** A real ידיעון course code, e.g. "0662-1234". The same discriminator
 *  scripts/mark-not-in-5787.ts uses to tell a course that VANISHED from the
 *  ידיעון apart from one a student typed in themselves. */
const YEDION_CODE = /^\d{4}-\d{4}$/;

/**
 * Was this course added by a student rather than scraped from the ידיעון?
 *
 * Matters for COPY, not for math: a de-listed catalog course honestly reads
 * "no longer in the ידיעון — it may have been cancelled", while a course the
 * student added themselves was never in our catalog to begin with and must
 * NEVER be described as missing/cancelled.
 */
export function isStudentAddedCourse(course: {
  code: string;
  isActive?: boolean | null;
}): boolean {
  return isOffCatalogCourse(course) && !YEDION_CODE.test(course.code);
}

/**
 * Did the student declare this off-catalog course approved for their degree?
 * (See the module header for why disciplineOverride carries the declaration.)
 */
export function isDeclaredApproved(uc: {
  disciplineOverride?: string | null;
  course: { isActive?: boolean | null };
}): boolean {
  return isOffCatalogCourse(uc.course) && uc.disciplineOverride != null;
}
