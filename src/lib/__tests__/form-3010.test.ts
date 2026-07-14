// M2 (note 45) — Form 3010 parsing + honest semester attribution, built
// against the REAL form's structure (periods table, DD/MM/YYYY, decimal days).

import { describe, it, expect } from "vitest";
import { parseForm3010, parseFormDate, summarizeForm3010 } from "@/lib/form-3010";

describe("parseForm3010", () => {
  it("parses a fenced, bidi-polluted echo of the real table", () => {
    const raw =
      '```json\n{"periods":[' +
      '{"startDate":"06/03/2026","endDate":"21/05/2026","days":77},' +
      '{"startDate":"‏15/05/2025","endDate":"20/06/2025","days":37},' +
      '{"startDate":"26/09/2024","endDate":"18/12/2024","days":84}],"totalDays":null}\n```';
    const f = parseForm3010(raw)!;
    expect(f.periods).toHaveLength(3);
    expect(f.periods[0]!.days).toBe(77);
    expect(f.periods[1]!.startDate).toBe("15/05/2025"); // bidi mark stripped
  });

  it("rejects garbage and out-of-range days (ISO dates are now NORMALIZED, not rejected)", () => {
    expect(parseForm3010("cannot read")).toBeNull();
    // Was asserted-null under the old strict regex — that strictness silently
    // killed Ariel's real form. ISO now normalizes to DD/MM/YYYY.
    const iso = parseForm3010('{"periods":[{"startDate":"2026-03-06","endDate":"21/05/2026","days":5}]}');
    expect(iso!.periods[0]!.startDate).toBe("06/03/2026");
    expect(parseForm3010('{"periods":[{"startDate":"06/03/2026","endDate":"21/05/2026","days":999}]}')).toBeNull();
  });
});

describe("parseFormDate", () => {
  it("DD/MM/YYYY → local noon date", () => {
    const d = parseFormDate("06/03/2026")!;
    expect([d.getDate(), d.getMonth() + 1, d.getFullYear(), d.getHours()]).toEqual([6, 3, 2026, 12]);
    expect(parseFormDate("6/3/2026")).toBeNull(); // strict format only
  });
});

describe("summarizeForm3010 — midpoint attribution, printed days only", () => {
  it("attributes each period to the semester of its midpoint; sums as printed", () => {
    const summary = summarizeForm3010({
      periods: [
        // Midpoint mid-April 2026 → SPRING תשפ"ו (startYear 2025).
        { startDate: "06/03/2026", endDate: "21/05/2026", days: 77 },
        // Midpoint early June 2025... before the 2025 calendar? If outside the
        // known calendars it must land in `unmapped`, never guessed.
        { startDate: "15/05/2025", endDate: "20/06/2025", days: 37 },
        // Midpoint December 2025 → FALL תשפ"ו.
        { startDate: "20/11/2025", endDate: "20/12/2025", days: 25 },
      ],
      totalDays: null,
    });
    const spring = summary.suggestions.find((s) => s.semester === "SPRING" && s.academicYear === 2025);
    expect(spring?.days).toBe(77); // exactly the printed count — never derived
    const fall = summary.suggestions.find((s) => s.semester === "FALL" && s.academicYear === 2025);
    expect(fall?.days).toBe(25);
    // Every period is accounted for exactly once (mapped or unmapped).
    const mappedPeriods = summary.suggestions.reduce((s, x) => s + x.periodCount, 0);
    expect(mappedPeriods + summary.unmapped.length).toBe(3);
    expect(summary.totalDays).toBe(77 + 37 + 25);
  });

  it("refuses to guess for periods outside the known TAU calendars", () => {
    const summary = summarizeForm3010({
      periods: [{ startDate: "21/05/2022", endDate: "26/05/2022", days: 5 }],
      totalDays: null,
    });
    // 2022 predates the calendar table (which now starts at תשפ"ד) →
    // unmapped, zero suggestions — still never guessing.
    expect(summary.suggestions).toHaveLength(0);
    expect(summary.unmapped).toHaveLength(1);
  });

  it("maps a תשפ\"ד war-year period with the OFFICIAL revised dates (14.7)", () => {
    // May 2024 was תשפ"ד SPRING *teaching* under the revised calendar
    // (teaching 26.5–12.8.24). A guessed normal calendar would have called
    // this summer break — the exact reason the dates had to be sourced.
    const summary = summarizeForm3010({
      periods: [{ startDate: "01/06/2024", endDate: "10/06/2024", days: 10 }],
      totalDays: null,
    });
    expect(summary.unmapped).toHaveLength(0);
    expect(summary.suggestions).toHaveLength(1);
    expect(summary.suggestions[0]!.academicYear).toBe(2023);
    expect(summary.suggestions[0]!.semester).toBe("SPRING");
    expect(summary.suggestions[0]!.days).toBe(10);
  });
});

describe("parseForm3010 — near-miss normalization (Ariel's real-form failure)", () => {
  it("accepts 1-digit day/month dates (6/3/2026)", () => {
    const form = parseForm3010('{"periods":[{"startDate":"6/3/2026","endDate":"21/5/2026","days":77}],"totalDays":null}');
    expect(form).not.toBeNull();
    expect(form!.periods[0]!.startDate).toBe("06/03/2026");
    expect(form!.periods[0]!.endDate).toBe("21/05/2026");
  });

  it("accepts dotted and dashed separators", () => {
    const form = parseForm3010('{"periods":[{"startDate":"06.03.2026","endDate":"21-05-2026","days":10}]}');
    expect(form).not.toBeNull();
    expect(form!.periods[0]!.startDate).toBe("06/03/2026");
    expect(form!.periods[0]!.endDate).toBe("21/05/2026");
  });

  it("accepts ISO dates (2026-03-06) and string day counts", () => {
    const form = parseForm3010('{"periods":[{"startDate":"2026-03-06","endDate":"2026-05-21","days":"77.0"}],"totalDays":"77"}');
    expect(form).not.toBeNull();
    expect(form!.periods[0]!.startDate).toBe("06/03/2026");
    expect(form!.periods[0]!.days).toBe(77);
    expect(form!.totalDays).toBe(77);
  });

  it("still rejects garbage honestly (no invention)", () => {
    expect(parseForm3010('{"periods":[{"startDate":"מרץ 2026","endDate":"מאי","days":77}]}')).toBeNull();
  });
});
