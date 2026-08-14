/**
 * Schedule Conflict Detector
 *
 * Detects time conflicts between schedule sessions.
 * Used when adding courses to the planner.
 */

import type { DayOfWeek } from "@/types/enums";
import { hhmmToMinutes, minutesToHhmm } from "@/lib/time-of-day";

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

      const existStart = hhmmToMinutes(existing.startTime);
      const existEnd = hhmmToMinutes(existing.endTime);
      const newStart = hhmmToMinutes(newSession.startTime);
      const newEnd = hhmmToMinutes(newSession.endTime);

      if (sessionsOverlap(existStart, existEnd, newStart, newEnd)) {
        const overlapStart = Math.max(existStart, newStart);
        const overlapEnd = Math.min(existEnd, newEnd);

        conflicts.push({
          existingSession: existing,
          newSession,
          day: existing.dayOfWeek,
          overlapStart: minutesToHhmm(overlapStart),
          overlapEnd: minutesToHhmm(overlapEnd),
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

      const aStart = hhmmToMinutes(a.startTime);
      const aEnd = hhmmToMinutes(a.endTime);
      const bStart = hhmmToMinutes(b.startTime);
      const bEnd = hhmmToMinutes(b.endTime);
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
          overlapStart: minutesToHhmm(Math.max(aStart, bStart)),
          overlapEnd: minutesToHhmm(Math.min(aEnd, bEnd)),
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

  // Wrap each time range in a bidi isolate (LRI…PDI) so "10:00–12:00" never
  // reverses inside the Hebrew sentence (#41 — the range read backwards). The
  // two consumers render this string raw, so the fix lives at the source.
  const range = (a: string, b: string) => `⁦${a}–${b}⁩`;
  const ex = conflict.existingSession;
  const nw = conflict.newSession;

  if (locale === "he") {
    return `חפיפה ביום ${dayName} בין ${ex.courseName} (${range(ex.startTime, ex.endTime)}) ל${nw.courseName} (${range(nw.startTime, nw.endTime)})`;
  }

  return `Conflict on ${dayName} between ${ex.courseName} (${range(ex.startTime, ex.endTime)}) and ${nw.courseName} (${range(nw.startTime, nw.endTime)})`;
}
