import { describe, it, expect } from "vitest";
import { calculateHonestLoad } from "@/lib/workload-calculator";

describe("calculateHonestLoad", () => {
  it("returns all-zero / light for an empty semester", () => {
    const r = calculateHonestLoad([]);
    expect(r.weeklyHours).toBe(0);
    expect(r.credits).toBe(0);
    expect(r.tightestExamGapDays).toBeNull();
    expect(r.label).toBe("light");
  });

  it("sums real contact hours from sessions (rounded to 0.5)", () => {
    const r = calculateHonestLoad([
      {
        credits: 3,
        sessions: [
          { dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00" }, // 2h
          { dayOfWeek: "TUESDAY", startTime: "09:00", endTime: "10:30" }, // 1.5h
        ],
      },
    ]);
    expect(r.weeklyHours).toBe(3.5);
    expect(r.credits).toBe(3);
  });

  it("ignores malformed / non-positive session times", () => {
    const r = calculateHonestLoad([
      {
        credits: 2,
        sessions: [
          { dayOfWeek: "SUNDAY", startTime: "14:00", endTime: "13:00" }, // negative → 0
          { dayOfWeek: "MONDAY", startTime: "bad", endTime: "10:00" }, // NaN → 0
          { dayOfWeek: "MONDAY", startTime: "08:00", endTime: "10:00" }, // 2h
        ],
      },
    ]);
    expect(r.weeklyHours).toBe(2);
  });

  it("leaves exam gap null when fewer than two dates are known", () => {
    const r = calculateHonestLoad([
      { credits: 3, examDate: new Date("2026-02-01") },
      { credits: 3, examDate: null },
      { credits: 3 },
    ]);
    expect(r.tightestExamGapDays).toBeNull();
  });

  it("finds the tightest gap between known exam dates", () => {
    const r = calculateHonestLoad([
      { credits: 3, examDate: new Date("2026-02-01T09:00:00") },
      { credits: 3, examDate: new Date("2026-02-10T09:00:00") }, // 9 days after first
      { credits: 3, examDate: new Date("2026-02-12T09:00:00") }, // 2 days after second
    ]);
    expect(r.tightestExamGapDays).toBe(2);
    expect(r.label).toBe("examCrunch");
  });

  it("accepts string exam dates too", () => {
    const r = calculateHonestLoad([
      { credits: 3, examDate: "2026-02-01" },
      { credits: 3, examDate: "2026-02-03" },
    ]);
    expect(r.tightestExamGapDays).toBe(2);
    expect(r.label).toBe("examCrunch");
  });

  it("labels a heavy contact week as 'hours' when no exam crunch", () => {
    const sessions = Array.from({ length: 12 }, (_, i) => ({
      dayOfWeek: "SUNDAY",
      startTime: `${String(8 + (i % 2) * 2).padStart(2, "0")}:00`,
      endTime: `${String(10 + (i % 2) * 2).padStart(2, "0")}:00`,
    }));
    // 12 sessions × 2h = 24h
    const r = calculateHonestLoad([{ credits: 10, sessions }]);
    expect(r.weeklyHours).toBe(24);
    expect(r.label).toBe("hours");
  });

  it("labels a heavy credit load as 'credits'", () => {
    const r = calculateHonestLoad([
      { credits: 21, sessions: [{ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00" }] },
    ]);
    expect(r.credits).toBe(21);
    expect(r.label).toBe("credits");
  });

  it("prioritizes exam crunch over hours and credits in the label", () => {
    const r = calculateHonestLoad([
      {
        credits: 25,
        sessions: [{ dayOfWeek: "SUNDAY", startTime: "08:00", endTime: "20:00" }], // 12h+
        examDate: "2026-02-01",
      },
      { credits: 5, examDate: "2026-02-02" }, // 1-day gap
    ]);
    expect(r.label).toBe("examCrunch");
  });
});
