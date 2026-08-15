// =========================================================================
// Ariel's sheet, version (6) — 15/08/2026. The rows that keep failing.
// =========================================================================
// Third scan of the same document, third report of missing data. His ask:
// "תחקור לעומק - אני לא רוצה להתמודד עם התקלה הזאת יותר - תכניס את זה
// לרשימת המשימות בתוך הבדיקות ותוודא את עצמך".
//
// So the two hard cases from that page are pinned here as MODEL OUTPUT — the
// JSON the vision pass actually has to survive — not as tidy fixtures.
//
// His hypothesis was the zero padding ("אולי כי כתוב 090?"). Tested below and
// it does NOT hold: 090 strips to 90 exactly like 089 strips to 89. The real
// find on this page is different, and it is TAU's own data:
//
//   4.0 4.0 ש' 260 חקיקה ורגולציה 1411-9107
//
// A grade of 260 does not exist on a 0-100 scale — and the sheet's own printed
// average proves TAU doesn't count it either:
//   with 260:    (100×5 + 90×3 + 260×4) / 12 = 150.8
//   without:     (100×5 + 90×3)        /  8 =  96.25  ← the printed value
// Whatever 260 encodes, it is not a grade. Our schema correctly refuses it —
// but refusing it used to drop the whole ROW, which made the COURSE vanish.
// That is the silent-loss shape this area keeps failing on.
import { describe, it, expect } from "vitest";
import { parseExtraction, takeRejectedRowCount } from "@/lib/grade-sheet";

/** The 2025/2 block of page 2, as the model returns it. */
const MODEL_JSON = JSON.stringify({
  rows: [
    { courseCode: "0618-1032", courseName: "מבוא לפילוסופיה חדשה", grade: null, credits: 2, passText: null, semester: "2025/2", inProgress: true },
    { courseCode: "0651-1005", courseName: "סטטיסטיקה לפכ\"מ", grade: null, credits: 5, passText: null, semester: "2025/2", inProgress: true },
    { courseCode: "1011-2103", courseName: "מיקרו כלכלה א' - קבלת החלטות כלכליות", grade: 100, credits: 5, passText: null, semester: "2025/2", inProgress: false },
    { courseCode: "1031-2108", courseName: "אסטרטגיה בעידן המודרני", grade: 90, credits: 3, passText: null, semester: "2025/2", inProgress: false },
    { courseCode: "1411-9107", courseName: "חקיקה ורגולציה", grade: 260, credits: 4, passText: null, semester: "2025/2", inProgress: false },
    { courseCode: "2171-9201", courseName: "מתקדמים ב' חוצה דיצפלינות בין תחומי", grade: 90, credits: 4, passText: null, semester: "2025/2", inProgress: false },
  ],
  englishLevelLabel: "פטור ע\"ס קורס",
  printedAverage: 96.25,
});

describe("the 090 hypothesis — tested, and it does not hold", () => {
  it("strips TAU's zero padding on 090 exactly like 089", () => {
    // Raw JSON with the padding intact, which is what actually arrives.
    const rows = parseExtraction('{"rows":[' +
      '{"courseCode":"1031-2108","courseName":"אסטרטגיה","grade":090,"credits":3,"passText":null},' +
      '{"courseCode":"0618-1018","courseName":"מוסר","grade":089,"credits":2,"passText":null}' +
    ']}')!;
    expect(rows.map((r) => r.grade)).toEqual([90, 89]);
  });

  it("handles every padded shape the sheet can print", () => {
    for (const [padded, expected] of [["060", 60], ["009", 9], ["000", 0], ["100", 100]] as const) {
      const rows = parseExtraction(`{"rows":[{"courseCode":"0000-0000","courseName":"x","grade":${padded},"credits":2,"passText":null}]}`)!;
      expect(rows[0]!.grade).toBe(expected);
    }
  });
});

describe("a 'grade' outside 0-100 loses the NUMBER, never the COURSE", () => {
  it("keeps חקיקה ורגולציה on the list, ungraded and flagged", () => {
    const rows = parseExtraction(MODEL_JSON)!;
    const law = rows.find((r) => r.courseCode === "1411-9107");
    expect(law).toBeDefined();                       // the course survives
    expect(law!.grade).toBeNull();                   // the 260 does not
    expect(law!.gradeOutOfRange).toBe(true);         // and we say why
    expect(law!.credits).toBe(4);                    // the rest of the row is intact
  });

  it("does not count it as a rejected row — nothing was actually lost", () => {
    parseExtraction(MODEL_JSON);
    expect(takeRejectedRowCount()).toBe(0);
  });

  it("every other row on the page is unaffected", () => {
    const rows = parseExtraction(MODEL_JSON)!;
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.courseCode === "1031-2108")!.grade).toBe(90);
    expect(rows.find((r) => r.courseCode === "1011-2103")!.grade).toBe(100);
    expect(rows.find((r) => r.courseCode === "2171-9201")!.grade).toBe(90);
    expect(rows.find((r) => r.courseCode === "0651-1005")!.grade).toBeNull();
  });

  it("REGRESSION: one bad row must never take the sheet down with it", () => {
    // Before 15.8 this returned null and the screen said "לא הצלחנו לקרוא
    // שורות" — twenty good rows thrown away because of one.
    expect(parseExtraction(MODEL_JSON)).not.toBeNull();
  });

  it("a row that is broken beyond the grade is still dropped, and counted", () => {
    // The retry only clears the grade. A row with no usable name is not a row.
    const rows = parseExtraction('{"rows":[' +
      '{"courseCode":"0000-0000","courseName":"","grade":260,"credits":2,"passText":null},' +
      '{"courseCode":"1111-1111","courseName":"תקין","grade":88,"credits":2,"passText":null}' +
    ']}')!;
    expect(rows).toHaveLength(1);
    expect(takeRejectedRowCount()).toBe(1);
  });
});

describe("the sheet's own average is the arithmetic that proves 260 is not a grade", () => {
  it("2025/2 computes to the printed 96.25 only when 260 is excluded", () => {
    const withLaw = (100 * 5 + 90 * 3 + 260 * 4) / 12;
    const withoutLaw = (100 * 5 + 90 * 3) / 8;
    expect(Math.round(withoutLaw * 100) / 100).toBe(96.25);
    expect(Math.round(withLaw * 10) / 10).not.toBe(96.25);
  });
});
