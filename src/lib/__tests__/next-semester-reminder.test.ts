// =========================================================================
// 13.8 — "אם סטודנט בוחר לתכנן רק את הסמסטר הקרוב, מתי זה מזכיר לו לתכנן את
// הסמסטר הבא?" The answer must come from the real academic calendar, must not
// fire at a student who has nothing planned at all, must not fire once the
// next semester HAS courses, and must never lean on an invented date for an
// academic year TAU hasn't published.
// =========================================================================

import { describe, it, expect } from "vitest";
import { getNextSemesterReminder, type PlannedRow } from "@/lib/next-semester-reminder";

const il = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h - 3));

/** Year-1 student who planned only the coming semester (FALL of study year 1). */
const onlyFall: PlannedRow[] = [
  { plannedYear: 1, plannedSemester: "FALL" },
  { plannedYear: 1, plannedSemester: "FALL" },
];

const ask = (courses: PlannedRow[], now: Date, storedYear = 1, startYear: number | null = 2026) =>
  getNextSemesterReminder({ courses, startYear, storedYear, now });

describe("getNextSemesterReminder — the half-planned year", () => {
  it("fires in the bidding run-up when סמסטר ב׳ is empty", () => {
    // 13.8.2026: planning anchor is FALL תשפ״ז, round 1 opens 7.9.26.
    const r = ask(onlyFall, il(2026, 8, 13));
    expect(r).not.toBeNull();
    expect(r!.reason).toBe("bidding-window");
    expect(r!.semester).toBe("SPRING");
    expect(r!.yearOfStudy).toBe(1); // FALL→SPRING stays inside one study year
    expect(r!.startYear).toBe(2026);
    expect(r!.biddingDaysUntil).toBe(25);
    expect(r!.key).toBe("2026-SPRING");
  });

  it("uses the PUBLISHED spring teaching start, never an estimate", () => {
    const r = ask(onlyFall, il(2026, 8, 13));
    // תשפ״ז SPRING teaching starts 9.3.27 per the official TAU calendar.
    expect(r!.teachingStart.getFullYear()).toBe(2027);
    expect(r!.teachingStart.getMonth()).toBe(2); // March
    expect(r!.teachingStart.getDate()).toBe(9);
  });

  it("fires on the plain calendar rollover, with no bidding window involved", () => {
    // 8.1.2027 — still inside fall teaching (ends 18.1.27), spring starts
    // 9.3.27, i.e. exactly at the 60-day lead. Bidding is long done.
    const r = ask(onlyFall, il(2027, 1, 8));
    expect(r?.reason).toBe("semester-rollover");
    expect(r?.semester).toBe("SPRING");
    expect(r?.biddingDaysUntil).toBeNull();
  });

  it("keeps pointing at the SAME semester after the planning anchor rolls over", () => {
    // 20.1.2027 — fall teaching has ended, so getPlanningAnchor has already
    // moved onto SPRING. The nudge must follow the semester, not the anchor,
    // and must keep its key so one dismissal covers the whole stretch.
    const before = ask(onlyFall, il(2027, 1, 8))!;
    const afterRollover = ask(onlyFall, il(2027, 1, 20))!;
    expect(afterRollover.reason).toBe("semester-rollover");
    expect(afterRollover.key).toBe(before.key);
    expect(afterRollover.key).toBe("2026-SPRING");
  });

  it("after the rollover, a student with NOTHING planned before it is left alone", () => {
    // Same date, but the previous semester is empty too — that's "no plan at
    // all", which the dashboard's empty-plan CTAs own.
    expect(ask([{ plannedYear: 2, plannedSemester: "SPRING" }], il(2027, 1, 20))).toBeNull();
  });

  it("does NOT fire while the rollover is still far off and no round is near", () => {
    // 1.11.2026 — fall is under way, spring is 128 days out, bidding is done.
    expect(ask(onlyFall, il(2026, 11, 1))).toBeNull();
  });

  it("goes quiet the moment the next semester has courses in it", () => {
    const both: PlannedRow[] = [
      ...onlyFall,
      { plannedYear: 1, plannedSemester: "SPRING" },
    ];
    expect(ask(both, il(2026, 8, 13))).toBeNull();
  });

  it("says nothing to a student who hasn't planned the coming semester either", () => {
    // A blank plan is a different, louder ask that other surfaces own.
    expect(ask([], il(2026, 8, 13))).toBeNull();
  });

  it("ignores rows belonging to a different study year", () => {
    const wrongYear: PlannedRow[] = [{ plannedYear: 2, plannedSemester: "FALL" }];
    expect(ask(wrongYear, il(2026, 8, 13))).toBeNull();
  });

  it("stays silent for an academic year TAU has not published — no invented date", () => {
    // 1.4.2027: anchor is SPRING תשפ״ז, so the "next" semester is FALL תשפ״ח,
    // which is not in TAU_CALENDARS. getAcademicNow's fallback would happily
    // hand back a made-up mid-October date; we must not use it.
    const springPlanned: PlannedRow[] = [{ plannedYear: 1, plannedSemester: "SPRING" }];
    expect(ask(springPlanned, il(2027, 4, 1))).toBeNull();
  });

  it("never nags about a semester that has already started", () => {
    // 1.4.2027 is inside SPRING תשפ״ז teaching (from 9.3.27). Even with FALL
    // planned and SPRING empty, "מתחיל ב-9.3.27" would be false — stay quiet.
    expect(ask(onlyFall, il(2027, 4, 1))).toBeNull();
  });

  it("stops at year 3 — PPE has no year-4 row to fill", () => {
    // 8.1.2027: anchor is FALL תשפ״ז. startYear 2024 → that anchor is study
    // year 3, so `after` would be SPRING of year 3 (fine) — push one further:
    // a year-3 student sitting in SPRING has no year-4 FALL to plan.
    const y3Spring: PlannedRow[] = [{ plannedYear: 3, plannedSemester: "SPRING" }];
    // 1.5.2027 — anchor is SPRING תשפ״ז, study year 3 for a 2024 starter.
    expect(ask(y3Spring, il(2027, 5, 1), 3, 2024)).toBeNull();
  });
});
