import { describe, it, expect } from "vitest";
import { daysUntilLabel, nearestUpcomingExam } from "@/lib/days-until";

describe("daysUntilLabel", () => {
  it("uses grammatical forms near the boundary (he)", () => {
    expect(daysUntilLabel(0, true)).toBe("היום");
    expect(daysUntilLabel(1, true)).toBe("בעוד יום");
    expect(daysUntilLabel(2, true)).toBe("בעוד יומיים");
    expect(daysUntilLabel(5, true)).toBe("בעוד 5 ימים");
  });
  it("uses grammatical forms near the boundary (en)", () => {
    expect(daysUntilLabel(0, false)).toBe("today");
    expect(daysUntilLabel(1, false)).toBe("in 1 day");
    expect(daysUntilLabel(3, false)).toBe("in 3 days");
  });
});

describe("nearestUpcomingExam", () => {
  const now = new Date("2026-06-01T09:00:00Z");
  const course = (nameHe: string, a: string | null, b: string | null, status = "PLANNED") => ({
    status,
    course: { nameHe, nameEn: null, examDateA: a, examDateB: b },
  });

  it("returns null when there are no future exams", () => {
    expect(nearestUpcomingExam([course("מיקרו", "2026-05-01T00:00:00Z", null)], now)).toBeNull();
    expect(nearestUpcomingExam([], now)).toBeNull();
  });

  it("picks the nearest FUTURE sitting across A/B and courses", () => {
    const r = nearestUpcomingExam(
      [
        course("סטטיסטיקה", "2026-06-20T00:00:00Z", "2026-07-05T00:00:00Z"),
        course("מיקרו", "2026-06-10T00:00:00Z", null),
      ],
      now,
    );
    expect(r?.nameHe).toBe("מיקרו");
    expect(r?.days).toBe(9); // civil days from 06-01 to 06-10
  });

  it("counts CIVIL days (UTC-midnight), immune to the current time-of-day", () => {
    // now is 09:00; a raw ms-ceil would inflate by a day. Exam 06-08 → 7 civil days.
    const r = nearestUpcomingExam([course("לוגיקה", "2026-06-08T00:00:00Z", null)], now);
    expect(r?.days).toBe(7);
  });

  it("skips COMPLETED / FAILED courses", () => {
    const r = nearestUpcomingExam(
      [
        course("עבר", "2026-06-05T00:00:00Z", null, "COMPLETED"),
        course("נכשל", "2026-06-06T00:00:00Z", null, "FAILED"),
        course("פעיל", "2026-06-15T00:00:00Z", null, "IN_PROGRESS"),
      ],
      now,
    );
    expect(r?.nameHe).toBe("פעיל");
  });
});
