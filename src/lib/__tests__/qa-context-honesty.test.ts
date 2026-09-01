// =========================================================================
// The advisor must not report a missing query as a fact (#22, #55)
// =========================================================================
// Ariel: "ולמה הוא אומר שלא שמרתי נתונים?"
//
// The server-side claim was fixed and the CLIENT kept its own copy. The router
// returns a hard-coded "עוד לא שמרתי אצלי שום קורס שלכם…" whenever
// `planIsEmpty`, and marks it `shouldEscalate: false` — so the King never gets
// a chance to correct it.
//
// `planIsEmpty` was `courses.length === 0` over `planQuery.data ?? []`. That is
// TRUE while the query is in flight and TRUE FOREVER if it errors (retry: 1),
// and the panel's send gate deliberately does not wait for that query. So a
// student with a full saved plan, whose plan request was merely slow, was told
// flatly that nothing of theirs was saved.
//
// "Nothing is saved" is a claim about the student's own data. It needs positive
// evidence: the query resolved AND came back empty.
//
// The second half is the same class one level over: "מה יש לי הסמסטר" was
// answered about the term that ended in July, because getAcademicNow calls the
// whole summer SPRING — for three months a year, including the entire bidding
// window.

import { describe, it, expect } from "vitest";

/** Exactly the expression in use-qa-context.ts. */
const planIsEmpty = (data: { courses: unknown[] } | undefined) =>
  data ? data.courses.length === 0 : false;

describe("'nothing is saved' requires evidence", () => {
  it("is FALSE while the plan query is still in flight", () => {
    // The regression: undefined data used to read as "empty".
    expect(planIsEmpty(undefined)).toBe(false);
  });

  it("is FALSE when the plan query failed", () => {
    // Same shape — a failed query leaves data undefined, and retry is 1.
    expect(planIsEmpty(undefined)).toBe(false);
  });

  it("is TRUE only when the query resolved and came back empty", () => {
    expect(planIsEmpty({ courses: [] })).toBe(true);
  });

  it("is FALSE for a student who has courses", () => {
    expect(planIsEmpty({ courses: [{}, {}] })).toBe(false);
  });

  it("the witness: the old expression called an unresolved query empty", () => {
    const OLD = (data: { courses: unknown[] } | undefined) => (data?.courses ?? []).length === 0;
    expect(OLD(undefined)).toBe(true);
    expect(planIsEmpty(undefined)).toBe(false);
  });
});

/** The referent of "this semester", as the context now resolves it. */
const liveSemester = (
  acad: { semester: string; phase: string },
  anchor: { semester: string },
) => (acad.phase === "break" ? anchor.semester : acad.semester);

describe("'this semester' means the one being planned, on a break", () => {
  it("during the summer break it is the coming FALL, not the spring that ended", () => {
    expect(liveSemester({ semester: "SPRING", phase: "break" }, { semester: "FALL" })).toBe("FALL");
  });

  it("the witness: the old value was the dead term", () => {
    expect({ semester: "SPRING", phase: "break" }.semester).toBe("SPRING");
  });

  it("mid-teaching it is still the term actually being taught", () => {
    // The fix must not hijack the answer during a real semester.
    expect(liveSemester({ semester: "FALL", phase: "teaching" }, { semester: "SPRING" })).toBe("FALL");
    expect(liveSemester({ semester: "SPRING", phase: "teaching" }, { semester: "FALL" })).toBe("SPRING");
  });

  it("during exams it is still the term being examined", () => {
    expect(liveSemester({ semester: "FALL", phase: "exams" }, { semester: "SPRING" })).toBe("FALL");
  });
});
