// =========================================================================
// "Share my week" (#3/#16 + finish-plan day 2) — a plain-text WhatsApp message
// of the weekly timetable, day by day. Pure and unit-tested; ends with a link
// to the landing page (the second viral loop). No emoji — house voice.
// =========================================================================

import type { ScheduleSessionData } from "@/components/calendar/weekly-timetable";

const DAY_ORDER = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

const DAY_HE: Record<string, string> = {
  SUNDAY: "יום א׳",
  MONDAY: "יום ב׳",
  TUESDAY: "יום ג׳",
  WEDNESDAY: "יום ד׳",
  THURSDAY: "יום ה׳",
  FRIDAY: "יום ו׳",
  SATURDAY: "שבת",
};

const TYPE_HE: Record<string, string> = {
  lecture: "הרצאה",
  tutorial: "תרגול",
  lab: "מעבדה",
};

export function buildWeekShareText(
  sessions: ScheduleSessionData[],
  opts: { semesterLabel: string; appUrl: string; isHe: boolean },
): string {
  const { semesterLabel, appUrl, isHe } = opts;
  const byDay = new Map<string, ScheduleSessionData[]>();
  for (const s of sessions) {
    (byDay.get(s.dayOfWeek) ?? byDay.set(s.dayOfWeek, []).get(s.dayOfWeek)!).push(s);
  }
  // #42 (12.7) — WhatsApp-native formatting: *bold* day headers and a clean
  // bullet per class. A list someone would actually send. No emoji — the file
  // header says so, and the product carries none either.
  const lines: string[] = [
    isHe ? `*המערכת שלי — ${semesterLabel}*` : `*My timetable — ${semesterLabel}*`,
  ];
  for (const day of DAY_ORDER) {
    const list = byDay.get(day);
    if (!list?.length) continue;
    lines.push("");
    lines.push(isHe ? `*${DAY_HE[day]}*` : `*${day.charAt(0) + day.slice(1).toLowerCase()}*`);
    for (const s of [...list].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      const name = isHe ? s.course.nameHe : (s.course.nameEn ?? s.course.nameHe);
      // DB casing isn't guaranteed lowercase (schedule.ts normalizes defensively
      // too) — same guard here so the type label never silently vanishes.
      const typeKey = s.sessionType.toLowerCase();
      const type = isHe ? (TYPE_HE[typeKey] ?? "") : typeKey;
      lines.push(`• ${s.startTime}–${s.endTime} ${name}${type ? ` (${type})` : ""}`);
    }
  }
  lines.push("");
  lines.push(isHe ? `נבנה עם פכמון — ${appUrl}` : `Built with Pakamon — ${appUrl}`);
  return lines.join("\n");
}
