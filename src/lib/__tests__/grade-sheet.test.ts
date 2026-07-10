import { describe, it, expect } from "vitest";
import { parseExtraction, parseEnglishLevelLabel, matchExtractedToCourses, type UserCourseLite } from "@/lib/grade-sheet";

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

  // #23 — the sheet prints the English level as words on the requirements line;
  // it rides along in the same payload without breaking the rows parse.
  it("still parses rows when an englishLevelLabel is present", () => {
    const rows = parseExtraction(
      '{"rows":[{"courseCode":"0651-1001","courseName":"מיקרו","grade":88,"credits":4,"passText":null}],"englishLevelLabel":"מתקדמים ב\'"}',
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.grade).toBe(88);
  });
});

describe("parseEnglishLevelLabel (#23)", () => {
  it("reads the raw English-level label off the payload", () => {
    expect(
      parseEnglishLevelLabel('{"rows":[],"englishLevelLabel":"מתקדמים ב\'"}'),
    ).toBe("מתקדמים ב'");
  });
  it("is null when the sheet prints no level line", () => {
    expect(parseEnglishLevelLabel('{"rows":[{"courseCode":null,"courseName":"x","grade":90,"credits":2,"passText":null}]}')).toBeNull();
    expect(parseEnglishLevelLabel("not json at all")).toBeNull();
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

// ── Course-lifecycle helpers (#22/#25/#30) ──
import { decideApplication, mapSheetSemesters, mapEnglishLevelLabel, matchExtractedToCatalog } from "@/lib/grade-sheet";
import type { MatchedRow } from "@/lib/grade-sheet";

const mkMatched = (over: Partial<MatchedRow>): MatchedRow => ({
  courseCode: "0651-1001", courseName: "x", grade: null, credits: null, passText: null,
  match: { userCourseId: "u", courseCode: "0651-1001", nameHe: "x", currentGrade: null, status: "IN_PROGRESS" },
  matchKind: "code", changesGrade: false, ambiguous: false, overwritesGrade: false, autoApplySafe: false, ...over,
});

describe("decideApplication — the declared outcome (no silent status)", () => {
  it("regular pass bar is 60, English pass bar is 70", () => {
    expect(decideApplication(mkMatched({ grade: 65 }))?.status).toBe("COMPLETED");
    const eng = mkMatched({ grade: 65, match: { userCourseId: "u", courseCode: "c", nameHe: "x", currentGrade: null, status: "IN_PROGRESS", courseType: "ENGLISH" } });
    expect(decideApplication(eng)?.status).toBe("FAILED"); // 65 < 70 → honest FAILED
    const eng70 = mkMatched({ grade: 70, match: { userCourseId: "u", courseCode: "c", nameHe: "x", currentGrade: null, status: "IN_PROGRESS", courseType: "ENGLISH" } });
    expect(decideApplication(eng70)?.status).toBe("COMPLETED");
  });

  it("failing regular grade → FAILED", () => {
    expect(decideApplication(mkMatched({ grade: 59 }))?.status).toBe("FAILED");
  });

  it("pass-text marks: עובר→COMPLETED(null), פטור→EXEMPT, נכשל→FAILED", () => {
    expect(decideApplication(mkMatched({ passText: "עובר" }))).toEqual({ grade: null, status: "COMPLETED" });
    expect(decideApplication(mkMatched({ passText: "פטור" }))).toEqual({ grade: null, status: "EXEMPT" });
    expect(decideApplication(mkMatched({ passText: "נכשל" }))).toEqual({ grade: null, status: "FAILED" });
  });

  it("in-progress (***) or no match → null (not applicable)", () => {
    expect(decideApplication(mkMatched({ grade: null, passText: null, inProgress: true }))).toBeNull();
    expect(decideApplication(mkMatched({ match: null }))).toBeNull();
  });
});

describe("mapSheetSemesters — chronological ranking, earliest = year 1", () => {
  it("two years, /1 /2 /3 → FALL/SPRING/SUMMER of the right study year", () => {
    const rows = [
      { courseCode: null, courseName: "a", grade: 90, credits: null, passText: null, semester: "2024/1" },
      { courseCode: null, courseName: "b", grade: 90, credits: null, passText: null, semester: "2024/2" },
      { courseCode: null, courseName: "c", grade: 90, credits: null, passText: null, semester: "2025/1" },
      { courseCode: null, courseName: "d", grade: 90, credits: null, passText: null, semester: "2025/3" },
    ];
    const m = mapSheetSemesters(rows);
    expect(m.get("2024/1")).toEqual({ plannedYear: 1, plannedSemester: "FALL" });
    expect(m.get("2024/2")).toEqual({ plannedYear: 1, plannedSemester: "SPRING" });
    expect(m.get("2025/1")).toEqual({ plannedYear: 2, plannedSemester: "FALL" });
    expect(m.get("2025/3")).toEqual({ plannedYear: 2, plannedSemester: "SUMMER" });
  });

  it("year 4+ clamps to 3; rows without a semester header are absent", () => {
    const rows = ["2022/1", "2023/1", "2024/1", "2025/1"].map((s) => ({ courseCode: null, courseName: "x", grade: 90, credits: null, passText: null, semester: s }));
    const m = mapSheetSemesters(rows);
    expect(m.get("2025/1")?.plannedYear).toBe(3); // clamped, not 4
    expect(m.get("nope")).toBeUndefined();
  });
});

describe("mapEnglishLevelLabel", () => {
  it("recognizes each level through mixed gershayim, null otherwise", () => {
    expect(mapEnglishLevelLabel("מתקדמים ב'")).toBe("ADVANCED_B");
    expect(mapEnglishLevelLabel("מתקדמים א׳")).toBe("ADVANCED_A");
    expect(mapEnglishLevelLabel("פטור")).toBe("EXEMPT");
    expect(mapEnglishLevelLabel("בסיסי")).toBe("BASIC");
    expect(mapEnglishLevelLabel("טרום בסיסי")).toBe("PRE_BASIC");
    expect(mapEnglishLevelLabel(null)).toBeNull();
    expect(mapEnglishLevelLabel("משהו אחר")).toBeNull();
  });
});

// ── SC: the REAL TAU transcript fixture (structure real, grades synthetic) ──
import { TAU_SHEET_RAW, TAU_SHEET_EXPECTED } from "./fixtures/tau-transcript";

describe("real TAU transcript (SC) — 100% row classification, zero invented grades", () => {
  const rows = parseExtraction(TAU_SHEET_RAW)!;

  it("parses every course row on the sheet — none skipped, none invented", () => {
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(TAU_SHEET_EXPECTED.length); // 21
  });

  it("classifies every row exactly: code, clean name, grade, credits, semester, in-progress", () => {
    for (let i = 0; i < TAU_SHEET_EXPECTED.length; i++) {
      const exp = TAU_SHEET_EXPECTED[i]!;
      const got = rows[i]!;
      expect(got.courseCode, `row ${i} code`).toBe(exp.courseCode);
      expect(got.courseName, `row ${i} name`).toBe(exp.courseName);
      expect(got.grade, `row ${i} grade`).toBe(exp.grade);
      expect(got.credits, `row ${i} credits`).toBe(exp.credits);
      expect(got.semester, `row ${i} semester`).toBe(exp.semester);
      expect(!!got.inProgress, `row ${i} inProgress`).toBe(exp.inProgress);
    }
  });

  it("zero invented grades: every *** row stays grade=null and nothing is applicable", () => {
    const inProgress = rows.filter((r) => r.inProgress);
    expect(inProgress).toHaveLength(9); // 8 PCM spring rows + the English course
    for (const r of inProgress) {
      expect(r.grade).toBeNull();
      const m = matchExtractedToCourses([r], [
        { userCourseId: "u", courseCode: r.courseCode!, nameHe: r.courseName, currentGrade: null, status: "IN_PROGRESS" },
      ]);
      expect(decideApplication(m[0]!)).toBeNull(); // nothing to write
    }
  });

  it("bidi controls and teaching-mode tokens never leak into names or codes", () => {
    const bidi = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
    for (const r of rows) {
      expect(bidi.test(r.courseName), r.courseName).toBe(false);
      expect(bidi.test(r.courseCode ?? ""), r.courseCode ?? "").toBe(false);
      expect(/(^|\s)(ש['׳’]|ת['׳’]|שו["״]ת|ת["״]וש)(\s|$)/.test(r.courseName), r.courseName).toBe(false);
    }
  });

  it("the English-level line becomes ADVANCED_B — and never a course row", () => {
    expect(parseEnglishLevelLabel(TAU_SHEET_RAW)).toBe("מתקדמים ב'");
    expect(mapEnglishLevelLabel(parseEnglishLevelLabel(TAU_SHEET_RAW))).toBe("ADVANCED_B");
    expect(rows.some((r) => r.courseName.includes("דרישות"))).toBe(false);
  });

  it("semester mapping: 2025/1 → year 1 FALL, 2025/2 → year 1 SPRING", () => {
    const m = mapSheetSemesters(rows);
    expect(m.get("2025/1")).toEqual({ plannedYear: 1, plannedSemester: "FALL" });
    expect(m.get("2025/2")).toEqual({ plannedYear: 1, plannedSemester: "SPRING" });
  });

  it("re-upload diff (SC-4): filling an empty grade pre-checks; replacing a recorded grade never does", () => {
    // The user's plan after a first upload: one course already carries a
    // (different) grade — the sheet now shows a corrected one (מועד ב' case).
    const plan: UserCourseLite[] = TAU_SHEET_EXPECTED.map((r, i) => ({
      userCourseId: `u${i}`,
      courseCode: r.courseCode,
      nameHe: r.courseName,
      currentGrade: r.courseCode === "0618-1018" ? 71 : null,
      status: r.grade != null ? "IN_PROGRESS" : "PLANNED",
    }));
    const matched = matchExtractedToCourses(rows, plan);
    for (const m of matched) expect(m.matchKind).toBe("code"); // every row resolves by code
    const overwrite = matched.find((m) => m.courseCode === "0618-1018")!;
    expect(overwrite.overwritesGrade).toBe(true);
    expect(overwrite.autoApplySafe).toBe(false); // explicit per-row approval only
    expect(overwrite.changesGrade).toBe(true);
    const fresh = matched.find((m) => m.courseCode === "0651-1007")!;
    expect(fresh.overwritesGrade).toBe(false);
    expect(fresh.autoApplySafe).toBe(true); // empty → filled is safe to pre-check
  });

  it("every graded row applies as an honest COMPLETED with the exact sheet grade", () => {
    const plan: UserCourseLite[] = TAU_SHEET_EXPECTED.map((r, i) => ({
      userCourseId: `u${i}`, courseCode: r.courseCode, nameHe: r.courseName, currentGrade: null, status: "IN_PROGRESS",
    }));
    const matched = matchExtractedToCourses(rows, plan);
    for (const m of matched.filter((x) => x.grade != null)) {
      const d = decideApplication(m)!;
      expect(d.status).toBe("COMPLETED"); // all synthetic grades ≥ 60
      expect(d.grade).toBe(m.grade); // written exactly as printed — never invented
    }
  });
});

describe("matchExtractedToCatalog", () => {
  const catalog = [{ code: "0651-1007", nameHe: "מתמטיקה לפכ\"מ" }, { code: "0618-1012", nameHe: "מבוא ללוגיקה" }];
  it("matches by exact code, then normalized name, else null", () => {
    const rows = [
      { courseCode: "0651-1007", courseName: "שם אחר", grade: 90, credits: null, passText: null },
      { courseCode: null, courseName: "מבוא ללוגיקה", grade: 90, credits: null, passText: null },
      { courseCode: "9999-9999", courseName: "לא קיים", grade: 90, credits: null, passText: null },
    ];
    const m = matchExtractedToCatalog(rows, catalog);
    expect(m[0]?.course?.code).toBe("0651-1007");
    expect(m[1]?.course?.code).toBe("0618-1012");
    expect(m[2]?.course).toBeNull();
  });

  // #audit-r3: two catalog courses with the same normalized name are ambiguous —
  // a code-less row must NOT bind to an arbitrary one (that would grade the wrong
  // course). A code match still works; only the ambiguous NAME is refused.
  it("refuses to name-match when the catalog name is ambiguous (collision)", () => {
    const dupCatalog = [
      { code: "1111-1111", nameHe: "סמינר" },
      { code: "2222-2222", nameHe: "סמינר" },
    ];
    const rows = [
      { courseCode: null, courseName: "סמינר", grade: 90, credits: null, passText: null },
      { courseCode: "2222-2222", courseName: "סמינר", grade: 90, credits: null, passText: null },
    ];
    const m = matchExtractedToCatalog(rows, dupCatalog);
    expect(m[0]?.course).toBeNull(); // ambiguous name → no auto-match
    expect(m[1]?.course?.code).toBe("2222-2222"); // code still resolves it
  });
});
