// =========================================
// Syllabus scanner — pure parsing/validation
// =========================================
// The vision model reads a course syllabus (photo/PDF) and returns the dated
// items on it: exam sittings and assignment deadlines. Everything becomes
// PERSONAL StudyTasks only after the student approves each row — we never
// write to the shared course catalog from a user upload (that would poison
// other students' data).

import { z } from "zod/v4";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  // Reject impossible calendar dates. `new Date("2026-02-30T…")` rolls over to
  // Mar 2 instead of failing, so the task would land on a different day than
  // the row the student approved. Build with the SAME local constructor used
  // to materialize the task and assert the components round-trip unchanged.
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y!, m! - 1, d!, 12, 0, 0, 0);
    return dt.getFullYear() === y && dt.getMonth() === m! - 1 && dt.getDate() === d;
  }, "invalid calendar date");

export const syllabusItemSchema = z.object({
  kind: z.enum(["exam", "assignment"]),
  title: z.string().min(1).max(120),
  /** Local calendar date the syllabus states; noon-stamped later (TZ-robust). */
  date: isoDate,
  /** "A" | "B" for exam sittings when stated; null otherwise. */
  moed: z.enum(["A", "B"]).nullable(),
});

export const syllabusExtractionSchema = z.object({
  courseName: z.string().max(120).nullable(),
  items: z.array(syllabusItemSchema).max(40),
});

export type SyllabusItem = z.infer<typeof syllabusItemSchema>;
export type SyllabusExtraction = z.infer<typeof syllabusExtractionSchema>;

/** Parse the model output (may be fenced); null on anything invalid. */
export function parseSyllabus(text: string): SyllabusExtraction | null {
  const stripped = text.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = syllabusExtractionSchema.safeParse(JSON.parse(stripped.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Noon local — a calendar date that survives timezone shifts (same rule as
 *  the exam-block noon stamp in study-task.ts). */
export function syllabusDateToLocalNoon(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

export const SYLLABUS_SYSTEM = `אתה קורא סילבוס של קורס אוניברסיטאי (צילום או PDF, עברית או אנגלית).
חלץ אך ורק תאריכים שכתובים בו במפורש — אל תמציא ואל תשלים תאריך שלא מופיע.
החזר JSON בלבד:
{"courseName":"שם הקורס" או null,"items":[{"kind":"exam" או "assignment","title":"תיאור קצר","date":"YYYY-MM-DD","moed":"A"/"B"/null}]}
כללים: kind="exam" רק לבחינות (מועד א׳ → moed:"A", מועד ב׳ → moed:"B"); הגשות/עבודות/בחנים → kind="assignment", moed:null.
פריט בלי תאריך מפורש — אל תכלול. אל תוסיף טקסט מחוץ ל-JSON.`;
