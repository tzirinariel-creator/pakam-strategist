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

  // The REAL TAU sheet zero-pads grades to 3 digits (089 = 89). A model that
  // echoes the padding emits invalid JSON (`"grade":089`) — this used to kill
  // the whole scan, which is why users saw "only 100s survive". (note #31)
  it("repairs zero-padded grades the sheet prints (089 → 89)", () => {
    const rows = parseExtraction(
      '{"rows":[' +
        '{"courseCode":"0618-1018","courseName":"מבוא לפילוסופיה של המוסר","grade":089,"credits":2,"passText":null},' +
        '{"courseCode":"0618-1012","courseName":"מבוא ללוגיקה","grade":100,"credits":4,"passText":null},' +
        '{"courseCode":"0651-1019","courseName":"תרגיל צמוד","grade": 092,"credits":2,"passText":null}]}',
    );
    expect(rows).toHaveLength(3);
    expect(rows?.map((r) => r.grade)).toEqual([89, 100, 92]);
  });

  // The teaching-mode column (ש' / ש'+ת' / שו"ת) sits next to the name column;
  // when the model glues it onto the name the UI showed "gibberish". (note #24)
  it("strips teaching-mode tokens glued onto course names", () => {
    const rows = parseExtraction(
      '{"rows":[' +
        '{"courseCode":null,"courseName":"מבוא ללוגיקה ש\'+ת\'","grade":100,"credits":4,"passText":null},' +
        '{"courseCode":null,"courseName":"חשבונאות לכלכלנים שו\\"ת","grade":85,"credits":2,"passText":null},' +
        '{"courseCode":null,"courseName":"ש\' מבוא לפילוסופיה חדשה","grade":90,"credits":2,"passText":null},' +
        '{"courseCode":null,"courseName":"קריאה מודרכת א\'","grade":95,"credits":2,"passText":null}]}',
    );
    expect(rows?.map((r) => r.courseName)).toEqual([
      "מבוא ללוגיקה",
      "חשבונאות לכלכלנים",
      "מבוא לפילוסופיה חדשה",
      "קריאה מודרכת א'", // ordinal letters are PART of real names — never stripped
    ]);
  });

  // *** in the grade column = enrolled, not yet graded — must come back as an
  // in-progress row, not get skipped or invented. Semester header context
  // ("סמסטר 2025/1") rides along per row. (note #26)
  it("keeps in-progress rows and per-row semester from the sheet", () => {
    const rows = parseExtraction(
      '{"rows":[' +
        '{"courseCode":"0651-1005","courseName":"סטטיסטיקה לפכ\\"מ","grade":null,"credits":5,"passText":null,"semester":"2025/2","inProgress":true},' +
        '{"courseCode":"0651-1007","courseName":"מתמטיקה לפכ\\"מ","grade":100,"credits":5,"passText":null,"semester":"2025/1","inProgress":false}]}',
    );
    expect(rows).toHaveLength(2);
    expect(rows?.[0]?.inProgress).toBe(true);
    expect(rows?.[0]?.grade).toBeNull();
    expect(rows?.[0]?.semester).toBe("2025/2");
    expect(rows?.[1]?.semester).toBe("2025/1");
  });

  it("stays backward-compatible when the model omits the new fields", () => {
    const rows = parseExtraction(
      '{"rows":[{"courseCode":"0651-1001","courseName":"מיקרו","grade":88,"credits":4,"passText":null}]}',
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.semester ?? null).toBeNull();
    expect(rows?.[0]?.inProgress ?? false).toBe(false);
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

  // Audit HIGH: a superset name (advanced variant, no code) must NOT silently
  // overwrite the base course's grade. It may match, but as low-confidence
  // "fuzzy" that is never auto-applied.
  it("treats an advanced-variant name as fuzzy, never auto-applied", () => {
    const plan: UserCourseLite[] = [
      { userCourseId: "u1", courseCode: "0621-1500", nameHe: "מבוא לתורת הקבוצות", currentGrade: 88, status: "COMPLETED" },
    ];
    const m = matchExtractedToCourses(
      [{ courseCode: null, courseName: "מבוא לתורת הקבוצות המתקדם", grade: 55, credits: null, passText: null }],
      plan,
    );
    expect(m[0]?.matchKind).toBe("fuzzy");
    expect(m[0]?.autoApplySafe).toBe(false); // stays unchecked in the UI
  });

  it("does not match a short common prefix like 'מבוא' to anything", () => {
    const m = matchExtractedToCourses(
      [{ courseCode: null, courseName: "מבוא", grade: 90, credits: null, passText: null }],
      COURSES,
    );
    expect(m[0]?.matchKind).toBe("none");
  });

  it("flags a same-code retake as ambiguous and never auto-applies it", () => {
    const retakes: UserCourseLite[] = [
      { userCourseId: "a", courseCode: "0651-1001", nameHe: "מיקרו (מועד ראשון)", currentGrade: 55, status: "FAILED" },
      { userCourseId: "b", courseCode: "0651-1001", nameHe: "מיקרו (חזרה)", currentGrade: null, status: "IN_PROGRESS" },
    ];
    const m = matchExtractedToCourses(
      [{ courseCode: "0651-1001", courseName: "מיקרו", grade: 78, credits: null, passText: null }],
      retakes,
    );
    expect(m[0]?.matchKind).toBe("code");
    expect(m[0]?.ambiguous).toBe(true);
    expect(m[0]?.autoApplySafe).toBe(false);
    expect(m[0]?.match?.userCourseId).toBe("b"); // prefers the not-yet-graded sitting
  });

  it("keeps exact matches auto-applyable", () => {
    const m = matchExtractedToCourses(
      [{ courseCode: "0651-1001", courseName: "מיקרו", grade: 90, credits: 4, passText: null }],
      COURSES,
    );
    expect(m[0]?.autoApplySafe).toBe(true);
  });
});
