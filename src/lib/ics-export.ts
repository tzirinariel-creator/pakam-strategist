// =========================================
// iCalendar (.ics) Export Utility
// =========================================
// Generates an .ics file from course schedule data
// for import into Google Calendar, Apple Calendar, etc.

import type { CourseWithSchedule } from "./plan-generator";
import { getTeachingRange } from "./academic-calendar";
import { sessionTypeNameFor } from "./group-options";
import { dayOfWeekIndex } from "./day-of-week";
import { hhmmToMinutesOr } from "./time-of-day";

// ─── Constants ─────────────────────────────────────────────────────

const DAY_MAP: Record<string, string> = {
  SUNDAY: "SU",
  MONDAY: "MO",
  TUESDAY: "TU",
  WEDNESDAY: "WE",
  THURSDAY: "TH",
  FRIDAY: "FR",
  SATURDAY: "SA",
};

// Teaching ranges come from THE academic-calendar module (verified TAU dates),
// shared with the Google sync so both export paths land on identical dates.

// ─── Helpers ─────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatICSDate(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T` +
    `${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

/**
 * RFC 5545 §3.3.10: when DTSTART uses a TZID (local + time-zone), the recurrence
 * UNTIL must be in UTC (trailing "Z"). Use end-of-day so the final in-range weekly
 * occurrence is retained rather than truncated.
 */
function formatICSUntilUTC(date: Date): string {
  const end = new Date(date);
  end.setHours(23, 59, 59, 0);
  return (
    `${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}T` +
    `${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}${pad(end.getUTCSeconds())}Z`
  );
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function getFirstDayOfWeek(
  startDate: Date,
  targetDay: string
): Date {
  const target = dayOfWeekIndex(targetDay) ?? 0;
  const current = startDate.getDay();
  const diff = (target - current + 7) % 7;
  const result = new Date(startDate);
  result.setDate(result.getDate() + diff);
  return result;
}

// ─── Main Export Function ────────────────────────────────────────

export function generateICS(
  courses: CourseWithSchedule[],
  semester: "FALL" | "SPRING",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pakamon//Course Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pakamon Schedule",
    "X-WR-TIMEZONE:Asia/Jerusalem",
  ];

  const range = getTeachingRange(semester);
  if (!range) return "";

  // UNTIL must be in UTC (trailing Z) per RFC 5545 when DTSTART uses a TZID.
  const untilDate = formatICSUntilUTC(range.end);

  for (const course of courses) {
    const sessions = course.scheduleSessions ?? [];

    for (const session of sessions) {
      const icsDay = DAY_MAP[session.dayOfWeek];
      if (!icsDay) continue;

      // Parse start/end times
      // One HH:MM parser (lib/time-of-day) with an EXPLICIT fallback. The old
      // inline copy let a garbage time reach setHours as NaN, which produced an
      // Invalid Date and emitted a literal "NaN" into the calendar file — the
      // download then failed to import at all. An unreadable time now falls back
      // to the same default a missing one always had.
      const startMin = hhmmToMinutesOr(session.startTime, 8 * 60);
      const endMin = hhmmToMinutesOr(session.endTime, 9 * 60);

      // Find the first occurrence of this day of week within the semester
      const firstOccurrence = getFirstDayOfWeek(range.start, session.dayOfWeek);
      const dtStart = new Date(firstOccurrence);
      dtStart.setHours(Math.floor(startMin / 60), startMin % 60, 0);
      const dtEnd = new Date(firstOccurrence);
      dtEnd.setHours(Math.floor(endMin / 60), endMin % 60, 0);

      const uid = `${course.id}-${session.dayOfWeek}-${session.startTime}@pakamon`;
      // ONE label source (lib/group-options). This file used to spell `tutorial`
      // "תרגיל" while every screen said "תרגול", so the calendar a student
      // DOWNLOADED disagreed with the calendar they were looking at (deferred-3).
      // `|| "lecture"` keeps the historical default for a missing/unknown type.
      const typeLabel = sessionTypeNameFor(session.sessionType || "lecture", true);
      const summary = `${course.nameHe} — ${typeLabel}`;
      const location = [session.building, session.room]
        .filter(Boolean)
        .join(", ");

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTART;TZID=Asia/Jerusalem:${formatICSDate(dtStart)}`);
      lines.push(`DTEND;TZID=Asia/Jerusalem:${formatICSDate(dtEnd)}`);
      lines.push(
        `RRULE:FREQ=WEEKLY;BYDAY=${icsDay};UNTIL=${untilDate}`
      );
      lines.push(`SUMMARY:${escapeICS(summary)}`);
      if (location) {
        lines.push(`LOCATION:${escapeICS(location)}`);
      }
      lines.push(
        `DESCRIPTION:${escapeICS(
          `${course.code} | ${course.credits} ש״ס`
        )}`
      );
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── Download Helper ─────────────────────────────────────────────

export function downloadICS(
  courses: CourseWithSchedule[],
  semester: "FALL" | "SPRING",
  filename = "pakamon-schedule.ics",
): void {
  const content = generateICS(courses, semester);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Alternative export from ScheduleSessionData[] ─────────────────
// Used in the calendar page where session data is already fetched

interface SessionForExport {
  id: string;
  courseCode: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string | null;
  building: string | null;
  sessionType: string;
  course: {
    code: string;
    nameHe: string;
    nameEn: string | null;
    credits: number;
  };
}

export function generateICSFromSessions(
  sessions: SessionForExport[],
  semester: "FALL" | "SPRING",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pakamon//Course Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pakamon Schedule",
    "X-WR-TIMEZONE:Asia/Jerusalem",
  ];

  const range = getTeachingRange(semester);
  if (!range) return "";

  // UNTIL must be in UTC (trailing Z) per RFC 5545 when DTSTART uses a TZID —
  // otherwise Google Calendar rejects the recurrence end. Matches generateICS.
  const untilDate = formatICSUntilUTC(range.end);

  for (const session of sessions) {
    const icsDay = DAY_MAP[session.dayOfWeek];
    if (!icsDay) continue;

    const startMin = hhmmToMinutesOr(session.startTime, 8 * 60);
    const endMin = hhmmToMinutesOr(session.endTime, 9 * 60);

    const firstOccurrence = getFirstDayOfWeek(range.start, session.dayOfWeek);
    const dtStart = new Date(firstOccurrence);
    dtStart.setHours(Math.floor(startMin / 60), startMin % 60, 0);
    const dtEnd = new Date(firstOccurrence);
    dtEnd.setHours(Math.floor(endMin / 60), endMin % 60, 0);

    const uid = `${session.id}@pakamon`;
    // Same single label source as generateICS above (deferred-3).
    const typeLabel = sessionTypeNameFor(session.sessionType || "lecture", true);
    const summary = `${session.course.nameHe} — ${typeLabel}`;
    const location = [session.building, session.room]
      .filter(Boolean)
      .join(", ");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART;TZID=Asia/Jerusalem:${formatICSDate(dtStart)}`);
    lines.push(`DTEND;TZID=Asia/Jerusalem:${formatICSDate(dtEnd)}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${icsDay};UNTIL=${untilDate}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    if (location) {
      lines.push(`LOCATION:${escapeICS(location)}`);
    }
    lines.push(
      `DESCRIPTION:${escapeICS(
        `${session.course.code} | ${session.course.credits} ש״ס`
      )}`
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICSFromSessions(
  sessions: SessionForExport[],
  semester: "FALL" | "SPRING",
  filename = "pakamon-schedule.ics",
): void {
  const content = generateICSFromSessions(sessions, semester);
  if (!content) return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Exam ICS Export ─────────────────────────────────────────────
// Generates .ics file for exam dates (Moed A and Moed B)

interface ExamForExport {
  userCourseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  examDateA: Date | null;
  examDateB: Date | null;
}

function formatICSAllDay(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function generateExamICS(exams: ExamForExport[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pakamon//Exam Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pakamon Exams",
    "X-WR-TIMEZONE:Asia/Jerusalem",
  ];

  for (const exam of exams) {
    // Moed A
    if (exam.examDateA) {
      const dateA = new Date(exam.examDateA);
      const nextDay = new Date(dateA);
      nextDay.setDate(nextDay.getDate() + 1);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:exam-a-${exam.userCourseId}@pakamon`);
      lines.push(`DTSTART;VALUE=DATE:${formatICSAllDay(dateA)}`);
      lines.push(`DTEND;VALUE=DATE:${formatICSAllDay(nextDay)}`);
      lines.push(`SUMMARY:${escapeICS(`${exam.courseName} — מועד א׳`)}`);
      lines.push(
        `DESCRIPTION:${escapeICS(
          `${exam.courseCode} | ${exam.credits} ש״ס | מועד א׳`
        )}`
      );
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-P1D");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeICS(`מחר בחינה: ${exam.courseName}`)}`);
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    }

    // Moed B
    if (exam.examDateB) {
      const dateB = new Date(exam.examDateB);
      const nextDay = new Date(dateB);
      nextDay.setDate(nextDay.getDate() + 1);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:exam-b-${exam.userCourseId}@pakamon`);
      lines.push(`DTSTART;VALUE=DATE:${formatICSAllDay(dateB)}`);
      lines.push(`DTEND;VALUE=DATE:${formatICSAllDay(nextDay)}`);
      lines.push(`SUMMARY:${escapeICS(`${exam.courseName} — מועד ב׳`)}`);
      lines.push(
        `DESCRIPTION:${escapeICS(
          `${exam.courseCode} | ${exam.credits} ש״ס | מועד ב׳`
        )}`
      );
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-P1D");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeICS(`מחר בחינה: ${exam.courseName}`)}`);
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadExamICS(
  exams: ExamForExport[],
  filename = "pakamon-exams.ics",
): void {
  const content = generateExamICS(exams);
  if (!content) return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
