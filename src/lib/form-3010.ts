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
import { getAcademicNow, TAU_CALENDARS } from "@/lib/academic-calendar";

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
/** Normalize a date Gemini echoed in a near-miss format to DD/MM/YYYY.
 *  Accepts D/M/YYYY, DD.MM.YYYY, DD-MM-YYYY and YYYY-MM-DD — all seen in
 *  real extractions (Ariel's actual form failed the strict regex silently).
 *  Anything else returns the input untouched (schema rejects it → honest). */
function normalizeFormDate(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim().replace(BIDI_CONTROLS, "");
  // YYYY-MM-DD → DD/MM/YYYY
  let m = t.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (m) return `${m[3]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[1]}`;
  // D/M/YYYY with /, ., or - separators → DD/MM/YYYY
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[3]}`;
  return v;
}

/** Coerce a near-miss extraction payload toward the strict schema: pad
 *  1-digit dates, convert dot/dash separators, numify string day-counts.
 *  NEVER invents values — only reformats what the model already returned. */
function normalizePayload(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const periods = Array.isArray(obj.periods)
    ? obj.periods.map((p) => {
        if (typeof p !== "object" || p === null) return p;
        const row = p as Record<string, unknown>;
        const days =
          typeof row.days === "string" && row.days.trim() !== "" && !isNaN(Number(row.days))
            ? Number(row.days)
            : row.days;
        return {
          ...row,
          startDate: normalizeFormDate(row.startDate),
          endDate: normalizeFormDate(row.endDate),
          days,
        };
      })
    : obj.periods;
  const totalDays =
    typeof obj.totalDays === "string" && obj.totalDays.trim() !== "" && !isNaN(Number(obj.totalDays))
      ? Number(obj.totalDays)
      : obj.totalDays;
  return { ...obj, periods, totalDays };
}

export function parseForm3010(text: string): Form3010 | null {
  const stripped = text.replace(BIDI_CONTROLS, "").replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(stripped.slice(start, end + 1));
    const parsed = form3010Schema.safeParse(normalizePayload(raw));
    if (!parsed.success) {
      // Server log only — lets us see WHY a real form was rejected instead
      // of a silent null (the "לא הצלחנו לקרוא" dead end Ariel hit).
      console.error("[form-3010] schema rejected extraction:", parsed.error.issues.slice(0, 5));
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.error("[form-3010] JSON parse failed:", (e as Error).message?.slice(0, 200));
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
  /**
   * Semesters that fall BEFORE the student began the degree (#7/#37). The form
   * lists a whole reserve career; service that predates enrolment grants no
   * academic benefit, so it is never suggested for import — only listed, so the
   * student sees we read the row and chose not to touch their degree with it.
   * Always empty when `startYear` is unknown (we don't guess a start year).
   */
  preDegree: SemesterSuggestion[];
  /** Periods outside the known TAU calendars — listed, never auto-assigned. */
  unmapped: { startDate: string; endDate: string; days: number }[];
  totalDays: number;
  /**
   * The degree-start anchor the split used (academic-year key, 2025 = תשפ"ו),
   * or null when the app doesn't know it. null ⇒ NOTHING was filtered and the
   * UI must say so instead of pretending the list is degree-only.
   */
  startYear: number | null;
}

/**
 * Attribute each period to ONE semester — the one containing its midpoint
 * (splitting a row's printed day-count across semesters would invent a
 * distribution the form doesn't state). Periods before/after the known TAU
 * calendars land in `unmapped` for manual handling.
 *
 * `opts.startYear` is the student's degree-start academic year. Semesters
 * earlier than it go to `preDegree` and are NEVER offered for import: a 3010
 * covers the student's whole reserve career, and importing service from before
 * they were a student produced a service table full of semesters they never
 * studied in (#7/#37). Unknown start year ⇒ no filtering AND an explicit
 * `startYear: null` so the UI degrades honestly rather than guessing.
 */
export function summarizeForm3010(
  form: Form3010,
  opts: { startYear?: number | null } = {},
): Form3010Summary {
  const startYear = opts.startYear ?? null;
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
    let now = getAcademicNow(mid);
    if (now.isStale) {
      // =====================================================================
      // 7.10.2023 — התקופה שנפלה בין הכיסאות (6.9)
      // =====================================================================
      // הלוח הראשון שאנחנו מכירים הוא תשפ״ד, וההוראה בו התחילה **31.12.2023**
      // כי המלחמה דחתה את פתיחת השנה. משמעות הדבר: כל שירות מ-7 באוקטובר עד
      // סוף דצמבר 2023 — הגיוס הגדול בתולדות המילואים, והבלוק הראשון בכמעט
      // כל טופס 3010 שסטודנט יעלה — היה מוקדם מכל חלון-שיוך, ונחת ברשימת
      // "לא הצלחנו לשייך".
      //
      // זו לא הייתה טעות בחישוב זכאות (השירות ההוא קדם לתואר של רוב מי
      // שלומד היום, ולכן ממילא אינו מזכה) — אבל היא הציגה את השורה הכי
      // מוכרת בטופס כאילו האפליקציה לא הצליחה לקרוא אותה.
      //
      // שנת לימודים מתחילה באוקטובר. תקופה שנופלת בין 1 באוקטובר של השנה
      // הראשונה שאנחנו מכירים לבין תחילת ההוראה שלה שייכת לסמסטר א׳ שלה,
      // ולא לשום מקום אחר. **רק** החלון הזה — כל תאריך מוקדם ממנו נשאר
      // unmapped, כי לנחש שנה אקדמית מתאריך שאין לנו לוח עבורו זו בדיוק
      // ההמצאה שהמודול הזה נכתב נגדה.
      const first = TAU_CALENDARS[0]!;
      const firstYearOpens = new Date(first.startYear, 9, 1, 0, 0, 0, 0); // 1.10
      if (mid >= firstYearOpens && mid < first.FALL.teachingStart) {
        now = { ...now, startYear: first.startYear, labelHe: first.labelHe, semester: "FALL", isStale: false };
      } else {
        // מחוץ ללוחות שאנחנו באמת מכירים — מסרבים לנחש.
        unmapped.push(p);
        continue;
      }
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

  const sorted = [...byKey.values()].sort(
    (a, b) => a.academicYear - b.academicYear || (a.semester === "FALL" ? -1 : 1),
  );
  const suggestions: SemesterSuggestion[] = [];
  const preDegree: SemesterSuggestion[] = [];
  for (const s of sorted) {
    if (startYear != null && s.academicYear < startYear) preDegree.push(s);
    else suggestions.push(s);
  }
  return { suggestions, preDegree, unmapped, totalDays, startYear };
}

/** Vision prompt — read ONLY what the form prints, never invent. Written
 *  against the real form layout (verified 11.7.2026). */
export const FORM_3010_SYSTEM = `אתה קורא "אישור רשמי — טופס 3010" של צה"ל (צילום או PDF, עברית, ימין-לשמאל): אישור על תקופות שירות מילואים פעיל.

מבנה המסמך:
- בטבלת התקופות, סדר העמודות מימין לשמאל: תאריך תחילה · תאריך סיום · סה״כ ימים · הערות · אופן הקריאה לשמ"פ.
- תאריכים בפורמט DD/MM/YYYY. "סה״כ ימים" עשוי להיות עשרוני (למשל 77.0).
- כל שורת תקופה בטבלה חייבת להופיע ב-periods — אל תדלג ואל תמזג שורות.
- אל תכלול את שורת הכותרת, פרטים אישיים, ברקוד או טקסט משפטי.
- אם בכותרת "הנדון" מופיע טווח כולל — אפשר להתעלם ממנו; totalDays הוא רק אם מודפס סה״כ מפורש.

החזר JSON בלבד:
{"periods":[{"startDate":"06/03/2026","endDate":"21/05/2026","days":77}],"totalDays":null}

כללים:
- חלץ אך ורק את מה שכתוב — אל תמציא תאריך, אל תשלים ימים ואל תחשב בעצמך.
- שדה לא קריא — דלג על השורה כולה במקום לנחש.
- אל תוסיף טקסט מחוץ ל-JSON.`;
