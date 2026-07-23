// =========================================================================
// The personal .ics feed body (retention hook #1). Pure + unit-tested.
// =========================================================================
// Turns the milestones the app ALREADY computes into dated calendar events
// WITH reminders (VALARM), so the student's own calendar — which they open
// daily — becomes the notification channel, with no push infra to build.
//
// HONESTY: only real, dated things go in. Exam dates come straight from the
// course rows (examDateA/B); the "enter grades" reminder uses the calendar's
// teachingEnd + 14d (semester-clock); the next-semester milestone uses the
// academic calendar. Nothing is invented — no bidding date is fabricated.

export interface FeedCourse {
  nameHe: string;
  code: string;
  examDateA: Date | null;
  examDateB: Date | null;
  /** COMPLETED/FAILED/etc — a graded course needs no "enter grade" pull. */
  status: string;
  grade: number | null;
}

export interface FeedInput {
  courses: FeedCourse[];
  /** teachingEnd + 14d for the CURRENT semester, or null (from semester-clock). */
  gradesOpenDate: Date | null;
  gradesSemesterLabelHe: string | null;
  /** Start of the next teaching period (academic-calendar). */
  nextTeachingStart: Date | null;
  now?: Date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** All-day DATE value (YYYYMMDD) in local terms — calendars treat it floating. */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function fmtStampUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** One all-day VEVENT with a day-before popup reminder. */
function allDayEvent(uid: string, date: Date, summary: string, desc: string, stamp: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${fmtDate(date)}`,
    `DTEND;VALUE=DATE:${fmtDate(addDays(date, 1))}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(desc)}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(summary)}`,
    "END:VALARM",
    "END:VEVENT",
  ];
}

/**
 * Build the full VCALENDAR text. Future-only: past milestones are dropped so a
 * fresh subscription isn't spammed with history.
 */
export function buildCalendarFeed(input: FeedInput): string {
  const now = input.now ? new Date(input.now) : new Date();
  now.setHours(0, 0, 0, 0);
  const stamp = fmtStampUTC(input.now ?? new Date());
  const isFuture = (d: Date) => d.getTime() >= now.getTime();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pakamon//Personal Feed//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:פכמון — תזכורות",
    "X-WR-TIMEZONE:Asia/Jerusalem",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const c of input.courses) {
    // A course already COMPLETED with a grade is done — its shared catalog
    // exam date (updated to THIS year's offering) must not push a phantom
    // "exam tomorrow" reminder to a student who passed it years ago. A FAILED
    // course keeps its reminder (the retake is still ahead). Same exclusion the
    // dashboard countdown uses (launch audit 24.7).
    if (c.status === "COMPLETED" && c.grade != null) continue;
    if (c.examDateA) {
      const d = new Date(c.examDateA);
      if (isFuture(d)) {
        lines.push(
          ...allDayEvent(
            `exam-a-${c.code}@pakamon`,
            d,
            `מבחן: ${c.nameHe} (מועד א׳)`,
            `${c.code} · פכמון. ודאו את התאריך המדויק במידע האישי.`,
            stamp,
          ),
        );
      }
    }
    if (c.examDateB) {
      const d = new Date(c.examDateB);
      if (isFuture(d)) {
        lines.push(
          ...allDayEvent(
            `exam-b-${c.code}@pakamon`,
            d,
            `מבחן: ${c.nameHe} (מועד ב׳)`,
            `${c.code} · פכמון. שימו לב — הציון האחרון קובע.`,
            stamp,
          ),
        );
      }
    }
  }

  // "Semester over — enter grades" on the day grades open, only if there's
  // something ungraded to enter.
  const hasUngraded = input.courses.some((c) => c.grade === null && c.status !== "COMPLETED" && c.status !== "EXEMPT");
  if (input.gradesOpenDate && isFuture(input.gradesOpenDate) && hasUngraded) {
    lines.push(
      ...allDayEvent(
        `grades-open-${fmtDate(input.gradesOpenDate)}@pakamon`,
        input.gradesOpenDate,
        `עדכנו ציונים בפכמון${input.gradesSemesterLabelHe ? ` (${input.gradesSemesterLabelHe})` : ""}`,
        "הציונים מתחילים להתפרסם — סרקו את הגיליון או הזינו ידנית כדי לעדכן את הממוצע ובדיקת המסלול.",
        stamp,
      ),
    );
  }

  // Next semester starts — a forward-motion anchor (bidding precedes it; we do
  // NOT invent a bidding date, just point at the real teaching start).
  if (input.nextTeachingStart && isFuture(input.nextTeachingStart)) {
    lines.push(
      ...allDayEvent(
        `next-semester-${fmtDate(input.nextTeachingStart)}@pakamon`,
        input.nextTeachingStart,
        "תחילת הסמסטר הבא — זמן לתכנן",
        "הסמסטר מתחיל. הבידינג נפתח לפני כן — כנסו לפכמון לבנות מערכת ולבדוק חפיפות.",
        stamp,
      ),
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
