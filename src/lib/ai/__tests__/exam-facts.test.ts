import { describe, it, expect } from "vitest";
import { buildExamPeriodBlock } from "@/lib/ai/exam-facts";
import type { StudyTaskLike } from "@/lib/plan-from-tasks";

const NOW = new Date(2026, 0, 10); // Jan 10 2026

const exam = (day: number, code: string, title: string): StudyTaskLike => ({
  taskType: "exam",
  startDate: new Date(2026, 0, day),
  notes: "[auto] difficulty:medium",
  courseCode: code,
  title,
  color: "#6366f1",
});
const study = (day: number, code: string, hours: number): StudyTaskLike => ({
  taskType: "study",
  startDate: new Date(2026, 0, day),
  notes: `[auto] ${hours}h`,
  courseCode: code,
  title: `לימוד: קורס ${code}`,
  color: "#6366f1",
});

describe("buildExamPeriodBlock", () => {
  it("null with no tasks or only past exams", () => {
    expect(buildExamPeriodBlock([], NOW)).toBeNull();
    expect(buildExamPeriodBlock([exam(5, "0651-1007", "מבחן: מתמטיקה לפכ\"מ")], NOW)).toBeNull();
  });

  it("lists upcoming exams with dates, moed and session count", () => {
    const block = buildExamPeriodBlock(
      [
        exam(20, "0651-1007", "מבחן: מתמטיקה לפכ\"מ"),
        study(15, "0651-1007", 2.5),
        study(17, "0651-1007", 2.5),
      ],
      NOW,
    );
    expect(block).toBeTruthy();
    expect(block).toContain("מתמטיקה");
    expect(block).toContain("20.1");
    expect(block).toContain("מועד א׳");
    expect(block).toContain("מפגשי-לימוד מתוכננים: 2");
  });

  it("peak day sums same-day sessions", () => {
    const block = buildExamPeriodBlock(
      [
        exam(20, "0651-1007", "מבחן: מתמטיקה לפכ\"מ"),
        study(15, "0651-1007", 2.5),
        study(15, "0651-1007", 3),
      ],
      NOW,
    )!;
    expect(block).toContain("היום העמוס ביותר: 15.1 (5.5 שעות)");
  });
});

// =========================================================================
// audit deferred-2 — the countdown the King states to the student as FACT
// =========================================================================
// This block is built on Vercel, where the process runs UTC. It used to bucket
// both sides by SERVER-LOCAL midnight, so on a UTC host the prompt said "מחר"
// for an exam that was already TODAY in Israel — and the King repeats that
// number verbatim. vitest.config.ts pins TZ=Asia/Jerusalem, which makes a
// server-local implementation look correct, so these cases force the host zone
// explicitly: the answer must be identical in every one of them.
describe("buildExamPeriodBlock — civil days in Israel, whatever the host clock", () => {
  /** Node honours a runtime TZ change; restore it whatever happens. */
  function withTZ<T>(zone: string, body: () => T): T {
    const prev = process.env.TZ;
    process.env.TZ = zone;
    try {
      return body();
    } finally {
      process.env.TZ = prev;
    }
  }

  // Exam blocks are stamped at NOON of the exam's calendar day (study-task.ts).
  const examAtNoon = (iso: string): StudyTaskLike => ({
    taskType: "exam",
    startDate: new Date(`${iso}T12:00:00Z`),
    notes: "[auto] difficulty:medium",
    courseCode: "0651-1007",
    title: 'מבחן: מתמטיקה לפכ"מ',
    color: "#6366f1",
  });

  // 2026-08-14T21:30Z = 00:30 on 15.8 in Israel (UTC+3). The server's own
  // calendar still says the 14th — that gap is the entire bug.
  const JUST_AFTER_IL_MIDNIGHT = new Date("2026-08-14T21:30:00Z");

  for (const zone of ["UTC", "Asia/Jerusalem", "America/New_York"]) {
    it(`says היום! for an exam that is today in Israel (host ${zone})`, () => {
      const block = withTZ(zone, () =>
        buildExamPeriodBlock([examAtNoon("2026-08-15")], JUST_AFTER_IL_MIDNIGHT),
      );
      expect(block).toContain("היום!");
      expect(block).not.toContain("מחר");
    });

    it(`says מחר for tomorrow, and בעוד N ימים beyond (host ${zone})`, () => {
      const tomorrow = withTZ(zone, () =>
        buildExamPeriodBlock([examAtNoon("2026-08-16")], JUST_AFTER_IL_MIDNIGHT),
      );
      expect(tomorrow).toContain("מחר");
      const later = withTZ(zone, () =>
        buildExamPeriodBlock([examAtNoon("2026-08-25")], JUST_AFTER_IL_MIDNIGHT),
      );
      expect(later).toContain("בעוד 10 ימים");
    });
  }
});
