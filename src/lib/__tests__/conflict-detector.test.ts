import { describe, it, expect } from "vitest";
import {
  detectTimeConflicts,
  formatConflict,
  type SessionInfo,
} from "@/lib/conflict-detector";

function session(over: Partial<SessionInfo>): SessionInfo {
  return {
    id: "s1",
    courseCode: "0000",
    courseName: "Course",
    dayOfWeek: "SUNDAY",
    startTime: "10:00",
    endTime: "12:00",
    sessionType: "lecture",
    ...over,
  };
}

describe("detectTimeConflicts", () => {
  it("returns no conflicts for an empty schedule", () => {
    expect(detectTimeConflicts([], [session({})])).toEqual([]);
  });

  it("detects an overlap on the same day and reports the overlap window", () => {
    const existing = session({ startTime: "10:00", endTime: "12:00" });
    const incoming = session({ id: "s2", startTime: "11:00", endTime: "13:00" });

    const conflicts = detectTimeConflicts([existing], [incoming]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.overlapStart).toBe("11:00");
    expect(conflicts[0]?.overlapEnd).toBe("12:00");
    expect(conflicts[0]?.day).toBe("SUNDAY");
  });

  it("treats adjacent sessions as NON-conflicting (08:00-09:00 vs 09:00-10:00)", () => {
    const a = session({ startTime: "08:00", endTime: "09:00" });
    const b = session({ id: "s2", startTime: "09:00", endTime: "10:00" });
    expect(detectTimeConflicts([a], [b])).toEqual([]);
  });

  it("does not conflict across different days", () => {
    const a = session({ dayOfWeek: "SUNDAY" });
    const b = session({ id: "s2", dayOfWeek: "MONDAY" });
    expect(detectTimeConflicts([a], [b])).toEqual([]);
  });

  it("detects identical time slots as a conflict", () => {
    const a = session({ startTime: "10:00", endTime: "12:00" });
    const b = session({ id: "s2", startTime: "10:00", endTime: "12:00" });
    expect(detectTimeConflicts([a], [b])).toHaveLength(1);
  });

  it("finds every overlapping pair across multiple sessions", () => {
    const existing = [
      session({ id: "e1", dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00" }),
      session({ id: "e2", dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00" }),
    ];
    const incoming = [
      session({ id: "n1", dayOfWeek: "SUNDAY", startTime: "11:00", endTime: "13:00" }),
      session({ id: "n2", dayOfWeek: "MONDAY", startTime: "11:00", endTime: "13:00" }),
    ];
    expect(detectTimeConflicts(existing, incoming)).toHaveLength(2);
  });
});

describe("formatConflict", () => {
  const conflict = {
    existingSession: session({ courseName: "Micro", startTime: "10:00", endTime: "12:00" }),
    newSession: session({
      id: "s2",
      courseName: "Stats",
      startTime: "11:00",
      endTime: "13:00",
    }),
    day: "SUNDAY" as const,
    overlapStart: "11:00",
    overlapEnd: "12:00",
  };

  it("formats in Hebrew", () => {
    const out = formatConflict(conflict, "he");
    expect(out).toContain("ראשון");
    expect(out).toContain("Micro");
    expect(out).toContain("Stats");
  });

  it("formats in English", () => {
    const out = formatConflict(conflict, "en");
    expect(out).toContain("Sunday");
    expect(out).toContain("Micro");
    expect(out).toContain("Stats");
  });
});
