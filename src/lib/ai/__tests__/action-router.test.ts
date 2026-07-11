// Active assistant — action detection. The safety property under test:
// propose ONLY on a confident single match; ambiguity or no-intent → null
// (never a wrong-course action card).

import { describe, it, expect } from "vitest";
import { detectAction, extractGrade, hasAddIntent } from "@/lib/ai/action-router";

const PLAN = [
  { userCourseId: "uc-1", nameHe: "מיקרו כלכלה א' + תרגיל", status: "IN_PROGRESS", courseType: "MANDATORY" },
  { userCourseId: "uc-2", nameHe: "אנגלית אקדמית מתקדמים ב'", status: "IN_PROGRESS", courseType: "ENGLISH" },
  { userCourseId: "uc-3", nameHe: "מבוא לפילוסופיה חדשה", status: "COMPLETED", courseType: "MANDATORY" },
  { userCourseId: "uc-4", nameHe: "חקיקה ורגולציה", status: "PLANNED", courseType: "LAW" },
];

const CATALOG = [
  { id: "c-1", code: "1011-4102", nameHe: "כלכלת חינוך" },
  { id: "c-2", code: "0618-2201", nameHe: "פילוסופיה של הדת" },
  { id: "c-3", code: "1031-2103", nameHe: "פוליטיקה של המזרח התיכון" },
];

describe("detectAction — COMPLETE_COURSE", () => {
  it("סיימתי מיקרו עם ציון → completes the right row with the grade", () => {
    const a = detectAction("סיימתי את מיקרו כלכלה עם ציון 88", PLAN, []);
    expect(a).toEqual({
      type: "COMPLETE_COURSE",
      userCourseId: "uc-1",
      courseName: "מיקרו כלכלה א' + תרגיל",
      grade: 88,
    });
  });

  it("סיימתי אנגלית → matches the ENGLISH row by type", () => {
    const a = detectAction("סיימתי אנגלית!", PLAN, []);
    expect(a?.type).toBe("COMPLETE_COURSE");
    expect((a as { userCourseId: string }).userCourseId).toBe("uc-2");
    expect((a as { grade: number | null }).grade).toBeNull();
  });

  it("never re-completes an already-COMPLETED course", () => {
    const a = detectAction("סיימתי את מבוא לפילוסופיה חדשה", PLAN, []);
    expect(a).toBeNull();
  });

  it("no course reference → null (falls back to a normal answer)", () => {
    expect(detectAction("סיימתי ללמוד להיום", PLAN, [])).toBeNull();
  });

  // Audit HIGH: ordinal siblings must not be confused. "סיימתי מיקרו א׳" when
  // only מיקרו ב׳ is in the actionable pool must NOT grab ב׳.
  it("ordinal-specific: does NOT grab a different-level sibling", () => {
    const plan = [
      { userCourseId: "m1", nameHe: "מיקרו כלכלה א' - החלטות + תרגול", status: "COMPLETED", courseType: "MANDATORY" },
      { userCourseId: "m2", nameHe: "מיקרו כלכלה ב' + תרגיל", status: "IN_PROGRESS", courseType: "MANDATORY" },
    ];
    // א׳ is already completed; the honest result is NOT "complete ב׳".
    expect(detectAction("סיימתי מיקרו א׳ עם 90", plan, [])).toBeNull();
  });

  it("ordinal-specific: DOES complete the matching level", () => {
    const plan = [
      { userCourseId: "m1", nameHe: "מיקרו כלכלה א' + תרגול", status: "COMPLETED", courseType: "MANDATORY" },
      { userCourseId: "m2", nameHe: "מיקרו כלכלה ב' + תרגיל", status: "IN_PROGRESS", courseType: "MANDATORY" },
    ];
    const a = detectAction("סיימתי את מיקרו ב׳ עם 84", plan, []);
    expect(a?.type).toBe("COMPLETE_COURSE");
    expect((a as { userCourseId: string }).userCourseId).toBe("m2");
    expect((a as { grade: number | null }).grade).toBe(84);
  });

  it("ADD ordinal-specific: asking to add ב׳ when ב׳ is in-plan does NOT propose ג׳", () => {
    const plan = [{ userCourseId: "m2", nameHe: "מיקרו כלכלה ב' + תרגיל", status: "PLANNED", courseType: "MANDATORY" }];
    const cat = [
      { id: "cA", code: "1", nameHe: "מיקרו כלכלה א'" },
      { id: "cG", code: "3", nameHe: "מיקרו כלכלה ג'" },
    ];
    expect(detectAction("תוסיף לי מיקרו ב׳", plan, cat)).toBeNull();
  });
});

describe("detectAction — ADD_COURSE", () => {
  it("תוסיף לי את כלכלת חינוך → proposes the catalog course", () => {
    const a = detectAction("תוסיף לי את כלכלת חינוך בבקשה", PLAN, CATALOG);
    expect(a).toEqual({ type: "ADD_COURSE", courseId: "c-1", courseName: "כלכלת חינוך" });
  });

  it("without a loaded catalog, add-intent returns null (caller fetches first)", () => {
    expect(detectAction("תוסיף לי את כלכלת חינוך", PLAN, [])).toBeNull();
    expect(hasAddIntent("תוסיף לי את כלכלת חינוך")).toBe(true);
  });

  it("ambiguous name across two courses → null, never a guess", () => {
    const cat = [
      { id: "x1", code: "1", nameHe: "כלכלה התנהגותית" },
      { id: "x2", code: "2", nameHe: "כלכלה פוליטית" },
    ];
    expect(detectAction("תוסיף לי קורס כלכלה", PLAN, cat)).toBeNull();
  });
});

describe("extractGrade", () => {
  it("finds grades in natural phrasings", () => {
    expect(extractGrade("עברתי עם 92")).toBe(92);
    expect(extractGrade("קיבלתי ציון 100")).toBe(100);
    expect(extractGrade("סיימתי, עוד אין ציון")).toBeNull();
  });

  it("rejects out-of-range numbers", () => {
    expect(extractGrade("קיבלתי 150")).toBeNull();
  });
});
