// =========================================================================
// The deterministic parser, against THREE real sheets from three real dates
// =========================================================================
// The vision scan lost real courses off Ariel's sheet on three separate days.
// Every previous fix improved the guess. This file tests the thing that
// replaced the guess: the PDF's own text layer, read with a regex.
//
// The strongest assertion here is not "the rows came out right" — it is that
// our recomputed averages equal the ones TAU PRINTED on the sheet, to the cent.
// A parser that dropped a row, misread a grade, or counted a course it
// shouldn't could not reproduce 96.42 / 96.25 / 96.39 by accident.
//
// The fixtures are Ariel's own PDFs with the name and ID replaced.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSheetText, weightedAverageOf, semesterAverageOf } from "@/lib/grade-sheet-text";

const fixture = (v: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", `tau-sheet-${v}.txt`), "utf-8");

describe("v6 — the sheet Ariel scanned when אסטרטגיה and אנגלית went missing", () => {
  const parsed = parseSheetText(fixture("v6"))!;

  it("finds every single course on both pages — 20 of 20", () => {
    expect(parsed.rows).toHaveLength(20);
    expect(new Set(parsed.rows.map((r) => r.courseCode)).size).toBe(20);
  });

  it("reads the four courses the vision scan kept losing", () => {
    const by = (c: string) => parsed.rows.find((r) => r.courseCode === c)!;
    expect(by("1031-4015").grade).toBe(93); // דוגרי
    expect(by("1880-0901").grade).toBe(94); // משבר האקלים
    expect(by("1031-2108").grade).toBe(90); // אסטרטגיה — the 090 row
    expect(by("2171-9201").grade).toBe(90); // מתקדמים ב' (English)
  });

  it("strips TAU's zero padding without inventing anything", () => {
    expect(parsed.rows.find((r) => r.courseCode === "0618-1018")!.grade).toBe(89); // 089
    expect(parsed.rows.find((r) => r.courseCode === "0618-1019")!.grade).toBe(96); // 096
  });

  it("keeps the course but not the number when the grade column holds 260", () => {
    const law = parsed.rows.find((r) => r.courseCode === "1411-9107")!;
    expect(law.courseName).toContain("חקיקה");
    expect(law.grade).toBeNull();
    expect(law.gradeOutOfRange).toBe(true);
    expect(law.credits).toBe(4);
  });

  it("marks the still-running courses from *** — not from a guess", () => {
    const running = parsed.rows.filter((r) => r.inProgress).map((r) => r.courseCode).sort();
    expect(running).toEqual(["0618-1032", "0651-1002", "0651-1003", "0651-1005"]);
  });

  it("reads 'לא לשקלול' as a BLANK משקל — the sheet's own exclusion signal", () => {
    const eng = parsed.rows.find((r) => r.courseCode === "2171-9201")!;
    expect(eng.note).toBe("לא לשקלול");
    expect(eng.credits).toBeNull();   // the משקל column is empty on the sheet
    expect(eng.hours).toBe(4);        // שעות is still printed
  });

  it("REPRODUCES THE SHEET'S OWN PRINTED AVERAGES, to the cent", () => {
    // This is the proof of completeness. Nothing missing, nothing extra.
    expect(parsed.semesterAverages["2025/1"]).toBe(96.42);
    expect(parsed.semesterAverages["2025/2"]).toBe(96.25);
    expect(parsed.programAverage).toBe(96.39);
    expect(semesterAverageOf(parsed.rows, "2025/1")).toBe(96.42);
    expect(semesterAverageOf(parsed.rows, "2025/2")).toBe(96.25);
    expect(weightedAverageOf(parsed.rows)).toBe(96.39);
  });

  it("places every row in the semester its header announced", () => {
    const sem1 = parsed.rows.filter((r) => r.semester === "2025/1");
    const sem2 = parsed.rows.filter((r) => r.semester === "2025/2");
    expect(sem1).toHaveLength(12);
    expect(sem2).toHaveLength(8); // 7 + the English row under its own header
  });

  it("reads the English standing verbatim, without interpreting it", () => {
    expect(parsed.englishLabel).toContain("פטור");
  });

  it("carries no personal identifiers we didn't ask for", () => {
    // The parser exposes the ID so the app can warn "this isn't your sheet".
    // The fixture is redacted, which is what this asserts.
    expect(parsed.studentId).toBe("000000000");
  });
});

describe("v4 — the SAME student, five weeks earlier, when semester ב׳ had no grades", () => {
  const parsed = parseSheetText(fixture("v4"))!;

  it("reads all 21 rows, including the course later dropped", () => {
    expect(parsed.rows.length).toBe(21);
    // 1011-2500 חשבונאות appears in v4 and is gone by v6 — a real withdrawal.
    expect(parsed.rows.some((r) => r.courseCode === "1011-2500")).toBe(true);
  });

  it("sees semester ב׳ as entirely still-running", () => {
    const sem2 = parsed.rows.filter((r) => r.semester === "2025/2");
    expect(sem2.length).toBeGreaterThan(0);
    expect(sem2.every((r) => r.grade === null)).toBe(true);
  });

  it("reproduces the printed average for the one graded semester", () => {
    expect(semesterAverageOf(parsed.rows, "2025/1")).toBe(parsed.semesterAverages["2025/1"]);
  });
});

describe("v5 — the middle version, so the parser is proven across time", () => {
  const parsed = parseSheetText(fixture("v5"))!;

  it("reproduces every printed average on the sheet", () => {
    for (const [sem, printed] of Object.entries(parsed.semesterAverages)) {
      expect(semesterAverageOf(parsed.rows, sem)).toBe(printed);
    }
    expect(weightedAverageOf(parsed.rows)).toBe(parsed.programAverage);
  });

  it("already had אסטרטגיה at 90 — the grade the scan kept losing", () => {
    expect(parsed.rows.find((r) => r.courseCode === "1031-2108")!.grade).toBe(90);
  });
});

describe("refuses politely when this is not a TAU grade sheet", () => {
  it("returns null on unrelated text, so the caller falls back to vision", () => {
    expect(parseSheetText("just some words")).toBeNull();
    expect(parseSheetText("")).toBeNull();
  });

  it("returns null on a sheet header with no course rows at all", () => {
    expect(parseSheetText("אישור קורסים וציונים\nשנה\"ל תשפ\"ו סמסטר 2025/1")).toBeNull();
  });
});
