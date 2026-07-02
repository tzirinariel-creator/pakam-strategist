import { describe, it, expect } from "vitest";
import { parseExtraction, matchExtractedToCourses, type UserCourseLite } from "@/lib/grade-sheet";

const COURSES: UserCourseLite[] = [
  { userCourseId: "u1", courseCode: "0651-1001", nameHe: "מבוא למיקרו כלכלה", currentGrade: null, status: "IN_PROGRESS" },
  { userCourseId: "u2", courseCode: "0618-1010", nameHe: "מבוא לפילוסופיה", currentGrade: 80, status: "COMPLETED" },
];

describe("parseExtraction", () => {
  it("parses a fenced JSON payload and validates rows", () => {
    const rows = parseExtraction('```json\n{"rows":[{"courseCode":"0651-1001","courseName":"מיקרו","grade":88,"credits":4,"passText":null}]}\n```');
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.grade).toBe(88);
  });

  it("rejects garbage, out-of-range grades, and non-JSON", () => {
    expect(parseExtraction("sorry, I cannot read this")).toBeNull();
    expect(parseExtraction('{"rows":[{"courseCode":null,"courseName":"x","grade":150,"credits":null,"passText":null}]}')).toBeNull();
  });
});

describe("matchExtractedToCourses", () => {
  it("matches by exact code first", () => {
    const m = matchExtractedToCourses(
      [{ courseCode: "0651-1001", courseName: "שם שונה לגמרי", grade: 90, credits: 4, passText: null }],
      COURSES,
    );
    expect(m[0]?.matchKind).toBe("code");
    expect(m[0]?.match?.userCourseId).toBe("u1");
    expect(m[0]?.changesGrade).toBe(true); // null → 90
  });

  it("falls back to normalized name matching", () => {
    const m = matchExtractedToCourses(
      [{ courseCode: null, courseName: "מבוא לפילוסופיה", grade: 80, credits: null, passText: null }],
      COURSES,
    );
    expect(m[0]?.matchKind).toBe("name");
    expect(m[0]?.match?.userCourseId).toBe("u2");
    expect(m[0]?.changesGrade).toBe(false); // 80 → 80, nothing to change
  });

  it("reports no match honestly (student decides manually)", () => {
    const m = matchExtractedToCourses(
      [{ courseCode: "9999-9999", courseName: "קורס שלא בתוכנית", grade: 70, credits: null, passText: null }],
      COURSES,
    );
    expect(m[0]?.matchKind).toBe("none");
    expect(m[0]?.match).toBeNull();
  });
});
