import { describe, it, expect } from "vitest";
import { sheetSemesterLabel } from "../sheet-semester-label";

describe("sheetSemesterLabel", () => {
  it("says in words what 2025/1 means", () => {
    // Ariel: "מה זה ה-1/2025 הזה?" — this is the answer, on screen.
    expect(sheetSemesterLabel("2025/1")?.text).toBe("סמסטר א׳ · תשפ״ו");
    expect(sheetSemesterLabel("2025/2")?.text).toBe("סמסטר ב׳ · תשפ״ו");
  });

  it("handles the summer term", () => {
    expect(sheetSemesterLabel("2025/3")?.text).toBe("סמסטר קיץ · תשפ״ו");
  });

  it("keeps the raw stamp so the sheet stays checkable", () => {
    expect(sheetSemesterLabel("2025/1")?.raw).toBe("2025/1");
  });

  it("spells neighbouring years correctly", () => {
    expect(sheetSemesterLabel("2024/1")?.text).toBe("סמסטר א׳ · תשפ״ה");
    expect(sheetSemesterLabel("2026/1")?.text).toBe("סמסטר א׳ · תשפ״ז");
  });

  it("gives English a form with no ambiguity to resolve", () => {
    expect(sheetSemesterLabel("2025/1", "en")?.text).toBe("Semester A 2025/26");
  });

  it("returns null rather than inventing a label", () => {
    expect(sheetSemesterLabel(null)).toBeNull();
    expect(sheetSemesterLabel("")).toBeNull();
    expect(sheetSemesterLabel("2025")).toBeNull();
    expect(sheetSemesterLabel("2025/9")).toBeNull();
    expect(sheetSemesterLabel("שנה א׳")).toBeNull();
  });

  it("still names the semester when the year is out of spelling range", () => {
    // The useful half of the label must not depend on the half we cannot derive.
    const r = sheetSemesterLabel("2099/1");
    expect(r?.text).toBe("סמסטר א׳");
  });
});
