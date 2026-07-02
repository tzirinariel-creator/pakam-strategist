/**
 * Schedule Conflict Detector
 *
 * Detects time conflicts between schedule sessions.
 * Used when adding courses to the planner.
 */

import type { DayOfWeek } from "@/types/enums";

// ─── Types ───────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  courseCode: string;
  courseName: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  sessionType: string;
}

export interface ConflictResult {
  existingSession: SessionInfo;
  newSession: SessionInfo;
  day: DayOfWeek;
  overlapStart: string;
  overlapEnd: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const parts = time.split(":");
  return (parseInt(parts[0] ?? "0", 10)) * 60 + parseInt(parts[1] ?? "0", 10);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function sessionsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ─── Main function ──────────────────────────────────────────────────

/**
 * Detect time conflicts between existing schedule sessions and new course sessions.
 * Returns an array of conflicts. Empty array = no conflicts.
 */
export function detectTimeConflicts(
  existingSessions: SessionInfo[],
  newCourseSessions: SessionInfo[],
): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  for (const existing of existingSessions) {
    for (const newSession of newCourseSessions) {
      // Must be on the same day
      if (existing.dayOfWeek !== newSession.dayOfWeek) continue;

      const existStart = timeToMinutes(existing.startTime);
      const existEnd = timeToMinutes(existing.endTime);
      const newStart = timeToMinutes(newSession.startTime);
      const newEnd = timeToMinutes(newSession.endTime);

      if (sessionsOverlap(existStart, existEnd, newStart, newEnd)) {
        const overlapStart = Math.max(existStart, newStart);
        const overlapEnd = Math.min(existEnd, newEnd);

        conflicts.push({
          existingSession: existing,
          newSession,
          day: existing.dayOfWeek,
          overlapStart: minutesToTime(overlapStart),
          overlapEnd: minutesToTime(overlapEnd),
        });
      }
    }
  }

  return conflicts;
}

/**
 * All time conflicts WITHIN one set of sessions (every unordered pair). Pairs
 * from the SAME course are skipped: a course's own lecture+tutorial are a single
 * bidding unit, not a clash. Deduped to one entry per (courseA, courseB, day) —
 * this powers the personalized bidding overlap alert ("last request wins").
 */
export function detectAllConflicts(sessions: SessionInfo[]): ConflictResult[] {
  const out: ConflictResult[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]!;
      const b = sessions[j]!;
      if (a.courseCode === b.courseCode) continue; // same unit, not a clash
      if (a.dayOfWeek !== b.dayOfWeek) continue;

      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      // A malformed time (NaN) must not silently "clear" the pair — skip it
      // explicitly; the remaining valid pairs still get checked.
      if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) continue;

      if (sessionsOverlap(aStart, aEnd, bStart, bEnd)) {
        const pair = [a.courseCode, b.courseCode].sort().join("|");
        const key = `${pair}|${a.dayOfWeek}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          existingSession: a,
          newSession: b,
          day: a.dayOfWeek,
          overlapStart: minutesToTime(Math.max(aStart, bStart)),
          overlapEnd: minutesToTime(Math.min(aEnd, bEnd)),
        });
      }
    }
  }

  return out;
}

/**
 * Format a conflict for display.
 */
export function formatConflict(conflict: ConflictResult, locale: "he" | "en"): string {
  const dayNames: Record<DayOfWeek, { he: string; en: string }> = {
    SUNDAY: { he: "ראשון", en: "Sunday" },
    MONDAY: { he: "שני", en: "Monday" },
    TUESDAY: { he: "שלישי", en: "Tuesday" },
    WEDNESDAY: { he: "רביעי", en: "Wednesday" },
    THURSDAY: { he: "חמישי", en: "Thursday" },
    FRIDAY: { he: "שישי", en: "Friday" },
  };

  const dayName = dayNames[conflict.day]?.[locale] ?? conflict.day;

  if (locale === "he") {
    return `חפיפה ביום ${dayName} בין ${conflict.existingSession.courseName} (${conflict.existingSession.startTime}-${conflict.existingSession.endTime}) ל${conflict.newSession.courseName} (${conflict.newSession.startTime}-${conflict.newSession.endTime})`;
  }

  return `Conflict on ${dayName} between ${conflict.existingSession.courseName} (${conflict.existingSession.startTime}-${conflict.existingSession.endTime}) and ${conflict.newSession.courseName} (${conflict.newSession.startTime}-${conflict.newSession.endTime})`;
}
