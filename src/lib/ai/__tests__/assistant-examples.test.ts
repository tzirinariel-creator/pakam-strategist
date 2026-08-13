// Note #14 — the advisor's teachable action examples. The whole point of this
// module is that an example is never a promise: it is verified against the real
// detector before it is offered, so a tap can't advertise a confirm card that
// will never render (the failure the constitution forbids).

import { describe, it, expect } from "vitest";
import { buildActionExamples, actionVerbsLine, EXAMPLE_GRADE } from "@/lib/ai/assistant-examples";
import { detectActions, type CatalogCourseLite, type PlanCourseLite } from "@/lib/ai/action-router";

const PLAN: PlanCourseLite[] = [
  { userCourseId: "u1", nameHe: "מבוא למיקרוכלכלה", status: "IN_PROGRESS" },
  { userCourseId: "u2", nameHe: "תורת המשחקים", status: "PLANNED" },
  { userCourseId: "u3", nameHe: "אתיקה ופילוסופיה פוליטית", status: "COMPLETED" },
];

const CATALOG: CatalogCourseLite[] = [
  { id: "c1", code: "1041-0100", nameHe: "כלכלת חינוך" },
  { id: "c2", code: "0618-1012", nameHe: "מבוא ללוגיקה" },
];

describe("buildActionExamples", () => {
  it("returns examples that the REAL detector resolves to the advertised verb", () => {
    const examples = buildActionExamples(PLAN, CATALOG, true);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) {
      const detected = detectActions(ex.prompt, PLAN, CATALOG);
      expect(detected[0]?.type, `"${ex.prompt}" did not produce ${ex.action}`).toBe(ex.action);
    }
  });

  it("teaches the three headline verbs when the plan and catalog allow it", () => {
    const kinds = buildActionExamples(PLAN, CATALOG, true).map((e) => e.action);
    expect(kinds).toContain("COMPLETE_COURSE");
    expect(kinds).toContain("ADD_COURSE");
    expect(kinds).toContain("MOVE_COURSE");
  });

  it("never names a course the student does not have (an empty plan yields no chips)", () => {
    // The brand-new student note #14 is about: nothing to complete or move, and
    // an add example only if a catalog was actually loaded.
    expect(buildActionExamples([], [], true)).toEqual([]);
    const addOnly = buildActionExamples([], CATALOG, true);
    expect(addOnly.every((e) => e.action === "ADD_COURSE")).toBe(true);
  });

  it("only ever offers rows that are still actionable — never a completed course", () => {
    const examples = buildActionExamples(PLAN, CATALOG, true);
    expect(examples.some((e) => e.prompt.includes("אתיקה ופילוסופיה פוליטית"))).toBe(false);
  });

  it("carries a placeholder grade the student is meant to edit (never a filed number)", () => {
    const complete = buildActionExamples(PLAN, CATALOG, true).find((e) => e.action === "COMPLETE_COURSE");
    expect(complete?.prompt).toContain(String(EXAMPLE_GRADE));
    // And the detector reads that grade — so what the chip shows is what the
    // confirm card will say. No silent mismatch between example and effect.
    const detected = detectActions(complete!.prompt, PLAN, CATALOG);
    expect(detected[0]).toMatchObject({ type: "COMPLETE_COURSE", grade: EXAMPLE_GRADE });
  });

  it("respects the limit so the intro never becomes a wall", () => {
    expect(buildActionExamples(PLAN, CATALOG, true, 1)).toHaveLength(1);
  });

  it("works in English too, and still verifies", () => {
    const examples = buildActionExamples(PLAN, CATALOG, false);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) {
      expect(detectActions(ex.prompt, PLAN, CATALOG)[0]?.type).toBe(ex.action);
    }
  });

  it("skips an ambiguous course name instead of promising a card that won't render", () => {
    // Two rows share every distinctive token → bestMatch ties → no action. The
    // builder must move on, not offer a dead chip.
    const ambiguous: PlanCourseLite[] = [
      { userCourseId: "a", nameHe: "סמינר מחקר", status: "PLANNED" },
      { userCourseId: "b", nameHe: "סמינר מחקר", status: "PLANNED" },
    ];
    const examples = buildActionExamples(ambiguous, [], true);
    expect(examples).toEqual([]);
  });
});

describe("actionVerbsLine", () => {
  it("names no course and states the confirm-card contract", () => {
    const he = actionVerbsLine(true);
    expect(he).toContain("[שם הקורס]");
    expect(he).toContain("כרטיס-אישור");
    expect(he).toMatch(/לא משתנה עד שתאשרו/);
  });

  it("stays in the plural product voice (Hebrew UI copy rule)", () => {
    expect(actionVerbsLine(true)).not.toMatch(/שלך|אליך|אותך/);
  });
});

// ── live-QA 13.8 regressions ──
describe("buildActionExamples — live-QA fixes", () => {
  it("never puts a Latin-script course title inside a Hebrew example sentence", () => {
    // Some catalog rows really do carry an English title in nameHe.
    const catalog: CatalogCourseLite[] = [
      { id: "x1", code: "1041-2222", nameHe: "Topics in Macroeconomics" },
      { id: "x2", code: "1041-3333", nameHe: "כלכלת חינוך" },
    ];
    const add = buildActionExamples(PLAN, catalog, true).find((e) => e.action === "ADD_COURSE");
    expect(add?.prompt).toContain("כלכלת חינוך");
    expect(add?.prompt).not.toContain("Topics in Macroeconomics");
  });

  it("teaches three verbs on more than one course when the plan allows it", () => {
    const examples = buildActionExamples(PLAN, CATALOG, true);
    const complete = examples.find((e) => e.action === "COMPLETE_COURSE");
    const move = examples.find((e) => e.action === "MOVE_COURSE");
    expect(complete).toBeDefined();
    expect(move).toBeDefined();
    expect(move!.prompt).not.toContain("מבוא למיקרוכלכלה"); // the one already used
  });

  it("falls back to reusing the same course rather than dropping the move lesson", () => {
    const single: PlanCourseLite[] = [{ userCourseId: "s1", nameHe: "תורת המשחקים", status: "PLANNED" }];
    const kinds = buildActionExamples(single, [], true).map((e) => e.action);
    expect(kinds).toContain("COMPLETE_COURSE");
    expect(kinds).toContain("MOVE_COURSE");
  });
});
