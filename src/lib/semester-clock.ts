// =========================================================================
// Semester clock — the trigger for the end-of-semester rite (#22). A thin
// derivation over THE academic calendar (Theme II's single source of truth):
// are we in the "grades are arriving" window of a semester that just ended,
// and which one? Pure; injectable `now` for tests.
// =========================================================================

import { getAcademicNow, type TeachingSemester } from "@/lib/academic-calendar";

const DAY_MS = 86_400_000;
const GRADES_OPEN_DELAY_DAYS = 14; // first grades land ~2 weeks after teaching ends

export interface WrapTarget {
  semester: TeachingSemester;
  /** Stable per-semester key, e.g. "2025-SPRING" (by academic start year). */
  key: string;
}

/**
 * The semester whose grades are now arriving, or null. Active from
 * teachingEnd + 14d through the end of the exam/break window (i.e. until the
 * next teaching phase begins) — so the rite never lingers into the next
 * semester (adversarial-critique fix 6: bounded by the real calendar, not a
 * fixed 134-day fallback).
 */
export function getWrapTarget(now: Date = new Date()): WrapTarget | null {
  const a = getAcademicNow(now);
  // Only after a semester's teaching has actually ended, and not in a stale
  // (out-of-calendar) window where dates can't be trusted.
  if (a.isStale) return null;
  if (a.phase === "teaching") return null;
  const gradesOpen = new Date(a.dates.teachingEnd.getTime() + GRADES_OPEN_DELAY_DAYS * DAY_MS);
  if (now < gradesOpen) return null; // exams just started, no grades yet
  return { semester: a.semester, key: `${a.startYear}-${a.semester}` };
}

export const wrapStorageKey = (key: string) => `pakamon-wrap-${key}`;
