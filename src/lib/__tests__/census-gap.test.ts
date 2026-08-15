// =========================================================================
// The census cross-check — Ariel's two lost courses, pinned
// =========================================================================
// He scanned the same sheet twice, days apart, and both times דוגרי (93) and
// משבר האקלים (94) never arrived, while אסטרטגיה and the English course
// arrived with their grades stripped. Nothing downstream could tell: a row the
// model never returns leaves no trace at all.
//
// The census asks a much narrower question — codes and grades only — and its
// answer is used ONLY to say "the sheet has rows you don't have". It never
// writes a grade. These tests hold that line: every case below asserts a
// QUESTION was raised, never that data was silently filled in.
import { describe, it, expect } from "vitest";
import { parseCodeCensus, censusGap } from "@/lib/grade-sheet";
import type { ExtractedRow } from "@/lib/grade-sheet";

const row = (courseCode: string, grade: number | null): ExtractedRow =>
  ({ courseCode, courseName: courseCode, grade, credits: 2, passText: null, semester: "2025/1", inProgress: grade == null }) as ExtractedRow;

describe("parseCodeCensus", () => {
  it("reads codes and grades, stripping TAU's zero padding", () => {
    expect(parseCodeCensus('{"codes":[{"courseCode":"0618-1018","grade":089}]}'))
      .toEqual([{ courseCode: "0618-1018", grade: 89 }]);
  });

  it("survives a fenced code block, like the main read does", () => {
    expect(parseCodeCensus('```json\n{"codes":[{"courseCode":"1031-4015","grade":93}]}\n```'))
      .toEqual([{ courseCode: "1031-4015", grade: 93 }]);
  });

  it("keeps a null grade as null — *** is not a zero", () => {
    expect(parseCodeCensus('{"codes":[{"courseCode":"0651-1005","grade":null}]}'))
      .toEqual([{ courseCode: "0651-1005", grade: null }]);
  });

  it("DROPS anything that is not a real TAU code", () => {
    // A hallucinated fragment must never become a "missing course" we ask about.
    const out = parseCodeCensus('{"codes":[{"courseCode":"1","grade":90},{"courseCode":"שלום","grade":80},{"courseCode":"0618-1012","grade":100}]}');
    expect(out).toEqual([{ courseCode: "0618-1012", grade: 100 }]);
  });

  it("returns null on unparseable text instead of throwing", () => {
    expect(parseCodeCensus("sorry, I can't read this")).toBeNull();
  });
});

describe("censusGap — Ariel's actual failures", () => {
  it("names דוגרי and משבר האקלים as rows the extraction never returned", () => {
    const extracted = [row("0618-1012", 100), row("1882-0301", 93)];
    const census = [
      { courseCode: "0618-1012", grade: 100 },
      { courseCode: "1031-4015", grade: 93 },  // דוגרי
      { courseCode: "1880-0901", grade: 94 },  // משבר האקלים
      { courseCode: "1882-0301", grade: 93 },
    ];
    const gap = censusGap(extracted, census);
    expect(gap.missingRows.map((r) => r.courseCode)).toEqual(["1031-4015", "1880-0901"]);
    expect(gap.missingGrades).toEqual([]);
  });

  it("catches a row that arrived with its grade stripped (אסטרטגיה, English)", () => {
    const extracted = [row("1031-2108", null), row("2171-9201", null)];
    const census = [
      { courseCode: "1031-2108", grade: 90 },
      { courseCode: "2171-9201", grade: 90 },
    ];
    const gap = censusGap(extracted, census);
    expect(gap.missingRows).toEqual([]);
    expect(gap.missingGrades).toEqual([
      { courseCode: "1031-2108", censusGrade: 90 },
      { courseCode: "2171-9201", censusGrade: 90 },
    ]);
  });

  it("stays silent when the two reads agree — no false alarms", () => {
    const extracted = [row("0618-1012", 100), row("0651-1005", null)];
    const census = [
      { courseCode: "0618-1012", grade: 100 },
      { courseCode: "0651-1005", grade: null },
    ];
    expect(censusGap(extracted, census)).toEqual({ missingRows: [], missingGrades: [] });
  });

  it("does not flag a course still in progress in BOTH reads", () => {
    // *** in the census too → genuinely ungraded, not a loss.
    const gap = censusGap([row("0651-1005", null)], [{ courseCode: "0651-1005", grade: null }]);
    expect(gap.missingGrades).toEqual([]);
  });

  it("a retake with one graded sitting is not reported as a lost grade", () => {
    // Same code twice: one attempt graded, one not. The grade IS present.
    const gap = censusGap(
      [row("0618-1012", null), row("0618-1012", 100)],
      [{ courseCode: "0618-1012", grade: 100 }],
    );
    expect(gap.missingGrades).toEqual([]);
    expect(gap.missingRows).toEqual([]);
  });

  it("asks about a duplicated census code only once", () => {
    const gap = censusGap([], [
      { courseCode: "1031-4015", grade: 93 },
      { courseCode: "1031-4015", grade: 93 },
    ]);
    expect(gap.missingRows).toHaveLength(1);
  });

  it("does nothing at all when the census itself failed", () => {
    // A failed census must never make the scan look worse than it is.
    expect(censusGap([row("0618-1012", 100)], null)).toEqual({ missingRows: [], missingGrades: [] });
    expect(censusGap([row("0618-1012", 100)], [])).toEqual({ missingRows: [], missingGrades: [] });
  });

  it("ignores extracted rows that carry no code, rather than crashing", () => {
    const noCode = { courseCode: null, courseName: "משהו", grade: 90, credits: 2, passText: null } as ExtractedRow;
    expect(() => censusGap([noCode], [{ courseCode: "1031-4015", grade: 93 }])).not.toThrow();
  });
});
