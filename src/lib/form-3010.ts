// =========================================
// M2 (note 45) — Form 3010 ("אישור רשמי — טופס 3010") extraction
// =========================================
// The official IDF confirmation of active reserve-service periods. Gemini
// vision reads the scanned form; THIS module owns the strict schema, the
// parsing, and the honest mapping of periods → academic semesters. Nothing is
// ever saved automatically — the UI shows the per-semester suggestion and the
// student approves each semester explicitly (the "no silent automation" rule).
//
// Written against Ariel's REAL form (received 11.7.2026): an RTL table with
// columns תאריך תחילה · תאריך סיום · סה"כ ימים · הערות · אופן הקריאה לשמ"פ,
// dates as DD/MM/YYYY, days as decimals ("77.0"), plus a header service range.

import { z } from "zod/v4";
import { getAcademicNow } from "@/lib/academic-calendar";

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export const form3010Schema = z.object({
  periods: z
    .array(
      z.object({
        /** DD/MM/YYYY exactly as printed. */
        startDate: z.string().regex(DATE_RE),
        endDate: z.string().regex(DATE_RE),
        /** The row's "סה\"כ ימים" — as printed, may be fractional. */
        days: z.number().min(0).max(400),
      }),
    )
    .max(40),
  /** The form's own total, when printed — used as a cross-check only. */
  totalDays: z.number().min(0).max(2000).nullish(),
});

export type Form3010 = z.infer<typeof form3010Schema>;

// Bidi controls saturate text echoed from Hebrew PDFs (same as the grade
// sheet) — strip before parsing.
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/g;

/** Parse the model's raw output into a validated Form3010, or null. */
export function parseForm3010(text: string): Form3010 | null {
  const stripped = text.replace(BIDI_CONTROLS, "").replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = form3010Schema.safeParse(JSON.parse(stripped.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** DD/MM/YYYY → local Date (noon — TZ-shift-proof), or null. */
export function parseFormDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

export interface SemesterSuggestion {
  /** Academic-calendar year key (e.g. 2025 = תשפ"ו). */
  academicYear: number;
  semester: "FALL" | "SPRING";
  labelHe: string;
  /** Sum of the PRINTED day counts of periods attributed here — never derived. */
  days: number;
  periodCount: number;
}

export interface Form3010Summary {
  suggestions: SemesterSuggestion[];
  /** Periods outside the known TAU calendars — listed, never auto-assigned. */
  unmapped: { startDate: string; endDate: string; days: number }[];
  totalDays: number;
}

/**
 * Attribute each period to ONE semester — the one containing its midpoint
 * (splitting a row's printed day-count across semesters would invent a
 * distribution the form doesn't state). Periods before/after the known TAU
 * calendars land in `unmapped` for manual handling.
 */
export function summarizeForm3010(form: Form3010): Form3010Summary {
  const byKey = new Map<string, SemesterSuggestion>();
  const unmapped: Form3010Summary["unmapped"] = [];
  let totalDays = 0;

  for (const p of form.periods) {
    const start = parseFormDate(p.startDate);
    const end = parseFormDate(p.endDate);
    totalDays += p.days;
    if (!start || !end) {
      unmapped.push(p);
      continue;
    }
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    const now = getAcademicNow(mid);
    if (now.isStale) {
      // Outside the calendars we actually know — refuse to guess.
      unmapped.push(p);
      continue;
    }
    const key = `${now.startYear}-${now.semester}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.days += p.days;
      cur.periodCount += 1;
    } else {
      byKey.set(key, {
        academicYear: now.startYear,
        semester: now.semester,
        labelHe: now.labelHe,
        days: p.days,
        periodCount: 1,
      });
    }
  }

  const suggestions = [...byKey.values()].sort(
    (a, b) => a.academicYear - b.academicYear || (a.semester === "FALL" ? -1 : 1),
  );
  return { suggestions, unmapped, totalDays };
}

/** Vision prompt — read ONLY what the form prints, never invent. Written
 *  against the real form layout (verified 11.7.2026). */
export const FORM_3010_SYSTEM = `אתה קורא "אישור רשמי — טופס 3010" של צה"ל (צילום או PDF, עברית, ימין-לשמאל): אישור על תקופות שירות מילואים פעיל.

מבנה המסמך:
- בטבלת התקופות, סדר העמודות מימין לשמאל: תאריך תחילה · תאריך סיום · סה"כ ימים · הערות · אופן הקריאה לשמ"פ.
- תאריכים בפורמט DD/MM/YYYY. "סה"כ ימים" עשוי להיות עשרוני (למשל 77.0).
- כל שורת תקופה בטבלה חייבת להופיע ב-periods — אל תדלג ואל תמזג שורות.
- אל תכלול את שורת הכותרת, פרטים אישיים, ברקוד או טקסט משפטי.
- אם בכותרת "הנדון" מופיע טווח כולל — אפשר להתעלם ממנו; totalDays הוא רק אם מודפס סה"כ מפורש.

החזר JSON בלבד:
{"periods":[{"startDate":"06/03/2026","endDate":"21/05/2026","days":77}],"totalDays":null}

כללים:
- חלץ אך ורק את מה שכתוב — אל תמציא תאריך, אל תשלים ימים ואל תחשב בעצמך.
- שדה לא קריא — דלג על השורה כולה במקום לנחש.
- אל תוסיף טקסט מחוץ ל-JSON.`;
