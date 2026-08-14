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
    ], new Date("2026-01-01").getTime()); // anchor "now" so the exams are future
    expect(r.tightestExamGapDays).toBe(2);
    expect(r.label).toBe("examCrunch");
  });

  it("accepts string exam dates too", () => {
    const r = calculateHonestLoad([
      { credits: 3, examDate: "2026-02-01" },
      { credits: 3, examDate: "2026-02-03" },
    ], new Date("2026-01-01").getTime());
    expect(r.tightestExamGapDays).toBe(2);
    expect(r.label).toBe("examCrunch");
  });

  it("labels a heavy contact week as 'hours' when no exam crunch", () => {
    // Distinct meetings, not 12 copies of two. The original fixture put all 12
    // on SUNDAY across only two time slots, so it was really 2 meetings written
    // ten extra times — which the de-duplication added on 13.8 correctly
    // collapses to 4h. Spread across the teaching week so the 24h is real.
    const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
    const sessions = Array.from({ length: 12 }, (_, i) => ({
      dayOfWeek: DAYS[i % 6]!,
      startTime: `${String(8 + Math.floor(i / 6) * 2).padStart(2, "0")}:00`,
      endTime: `${String(10 + Math.floor(i / 6) * 2).padStart(2, "0")}:00`,
    }));
    // 12 distinct sessions × 2h = 24h
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
    ], new Date("2026-01-01").getTime());
    expect(r.label).toBe("examCrunch");
  });
});

  // P3′ spec edge case: two exams on the SAME day → gap is 0, not null.
  it("two exams on the same day → tightest gap is 0", () => {
    const r = calculateHonestLoad([
      { credits: 4, examDate: "2026-07-20" },
      { credits: 4, examDate: "2026-07-20" },
    ], new Date("2026-07-01").getTime());
    expect(r.tightestExamGapDays).toBe(0);
    expect(r.label).toBe("examCrunch"); // 0 ≤ 3 — the sharpest real pain
  });

  // QA 13.7 — stale PAST exam dates (a FALL plan viewed in July inherits the
  // last-scraped SPRING dates) must NOT read as a 0-day crunch; the gap is unknown.
  it("ignores past exam dates → gap is unknown (null), not a false 0-day crunch", () => {
    const now = new Date("2026-07-13").getTime();
    const r = calculateHonestLoad(
      [
        { credits: 4, examDate: "2026-07-11" }, // past, same day
        { credits: 4, examDate: "2026-07-11" }, // past, same day
      ],
      now,
    );
    expect(r.tightestExamGapDays).toBeNull();
    expect(r.label).not.toBe("examCrunch");
  });

  // ── audit deferred-2: the same civil-day bug as the exam countdown ──
  // Exam dates are date-only values stored at UTC MIDNIGHT, so a raw
  // `examMs >= nowMs` filter dropped an exam the instant its own day started.
  // At 12:00 Israel on the morning of an exam the density metric had already
  // lost it — and with one date left the "tightest gap" fell back to "unknown",
  // i.e. the honest-load card stopped warning about a crunch on the day of it.
  // Instants are written as explicit UTC with their Israeli wall clock.
  it("an exam happening TODAY still counts — it does not vanish at its own midnight", () => {
    const now = new Date("2026-08-15T09:00:00Z").getTime(); // 12:00 Israel, 15.8
    const r = calculateHonestLoad(
      [
        { credits: 4, examDate: "2026-08-15" }, // TODAY — must still count
        { credits: 4, examDate: "2026-08-17" },
      ],
      now,
    );
    expect(r.tightestExamGapDays).toBe(2);
    expect(r.label).toBe("examCrunch");
  });

  it("00:30 Israel: yesterday's exam is out, today's is in", () => {
    const now = new Date("2026-08-14T21:30:00Z").getTime(); // 00:30 Israel, 15.8
    const past = calculateHonestLoad(
      [
        { credits: 4, examDate: "2026-08-13" },
        { credits: 4, examDate: "2026-08-14" }, // yesterday for the student
      ],
      now,
    );
    expect(past.tightestExamGapDays).toBeNull();

    const live = calculateHonestLoad(
      [
        { credits: 4, examDate: "2026-08-15" }, // today for the student
        { credits: 4, examDate: "2026-08-16" },
      ],
      now,
    );
    expect(live.tightestExamGapDays).toBe(1);
  });

  it("the gap is a whole number of civil days across the DST flip", () => {
    // 27.3.2026 is the Israeli spring-forward night; a raw ms difference between
    // the two UTC-midnight dates would be 3.958… days, not 4.
    const r = calculateHonestLoad(
      [
        { credits: 4, examDate: "2026-03-26" },
        { credits: 4, examDate: "2026-03-30" },
      ],
      new Date("2026-03-01T12:00:00Z").getTime(),
    );
    expect(r.tightestExamGapDays).toBe(4);
    expect(Number.isInteger(r.tightestExamGapDays)).toBe(true);
  });

// ── 13.8: "8 שעות שבועיות" printed directly above a grid showing 6 ──
describe("weekly hours are de-duplicated, so the summary and the grid agree", () => {
  it("counts a duplicated catalog row ONCE", () => {
    // The real shape: course 1011-3310, Tuesday 12:00–14:00, tutorial, group 01,
    // present twice under two row ids. The weekly grid already collapses this
    // via dedupeMeetings; this function used to sum it raw.
    const dup = { dayOfWeek: "TUESDAY", startTime: "12:00", endTime: "14:00", sessionType: "tutorial", groupCode: "01" };
    const r = calculateHonestLoad([{ credits: 4, sessions: [dup, { ...dup }] }]);
    expect(r.weeklyHours).toBe(2);
  });

  it("still counts a lecture and a tutorial at the same hour — that is a CLASH, not a duplicate", () => {
    const r = calculateHonestLoad([
      {
        credits: 4,
        sessions: [
          { dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00", sessionType: "lecture", groupCode: "01" },
          { dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00", sessionType: "tutorial", groupCode: "03" },
        ],
      },
    ]);
    expect(r.weeklyHours).toBe(4);
  });

  it("never collapses across DIFFERENT courses at the same hour", () => {
    const at = { dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00", sessionType: "lecture", groupCode: "01" };
    const r = calculateHonestLoad([
      { credits: 4, sessions: [at] },
      { credits: 4, sessions: [{ ...at }] },
    ]);
    expect(r.weeklyHours).toBe(4);
  });

  it("is unchanged for callers that pass no sessionType/groupCode", () => {
    const r = calculateHonestLoad([
      {
        credits: 4,
        sessions: [
          { dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00" },
          { dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "12:00" },
        ],
      },
    ]);
    expect(r.weeklyHours).toBe(4);
  });
});
