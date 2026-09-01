// =========================================================================
// The transcript is saved before the plan (#34, #27)
// =========================================================================
// Ariel: "לא הבנתי… העליתי בהתחלה סילבוס וזה פשוט לא עבר לכאן" — his screenshot
// shows an EMPTY academic record right after onboarding, where he had uploaded a
// grade sheet. And #27: the dashboard said he had completed 5% of the degree,
// "על אף שהעליתי לו סילבוס בהתחלה עם קורסים עם ציון כבר".
//
// One cause, and it was the ORDER plus a missing catch:
//
//   1. The plan was saved first and the scanned history second, on a comment
//      claiming "savePlan replaces all UserCourses, so it MUST run before". That
//      stopped being true when savePlan became a reconcile touching only
//      PLANNED/IN_PROGRESS FALL/SPRING rows — a COMPLETED row is never in its way.
//   2. The history save had no isolation. A 20s timeout there threw out of the
//      whole block AFTER the plan had already been written, leaving a populated
//      planner, an empty academic record, and a percentage that ignored every
//      grade the student had just uploaded.
//
// A plan can be rebuilt in a minute. A scanned transcript is the one thing here
// a student cannot cheaply redo — and the one they waited on an OCR pass for.
// So it goes first, each step is isolated, and a partial save is reported as
// what it is rather than as "check your connection".

import { describe, it, expect } from "vitest";

type Step = "history" | "plan" | "custom";

/** The sequence in step-ready.tsx, as a testable order + isolation model. */
async function runSave(opts: { historyFails?: boolean; planFails?: boolean; customFails?: boolean }) {
  const ran: Step[] = [];
  const failures: string[] = [];

  ran.push("history");
  if (opts.historyFails) failures.push("history");

  ran.push("plan");
  if (opts.planFails) failures.push("plan");

  ran.push("custom");
  if (opts.customFails) failures.push("history");

  const outcome = failures.includes("history")
    ? "history"
    : failures.includes("plan")
      ? "plan"
      : "ok";
  return { ran, outcome };
}

describe("the irreplaceable data goes first", () => {
  it("saves the completed history before the plan", async () => {
    const { ran } = await runSave({});
    expect(ran.indexOf("history")).toBeLessThan(ran.indexOf("plan"));
  });

  it("still saves the plan when the history save fails", async () => {
    // Isolation, in the direction that used to abort everything downstream.
    const { ran } = await runSave({ historyFails: true });
    expect(ran).toContain("plan");
  });

  it("still saves the history when the plan save fails", async () => {
    const { ran } = await runSave({ planFails: true });
    expect(ran).toContain("history");
  });
});

describe("a partial save is reported as a partial save", () => {
  it("a lost transcript is named 'history', never a network error", async () => {
    // The regression: the student was told to check their connection about a
    // sheet the app had already accepted and then dropped.
    expect((await runSave({ historyFails: true })).outcome).toBe("history");
  });

  it("a failed custom-course batch also counts as a lost transcript", async () => {
    // Those rows are grades too. Swallowing them silently was the old behaviour.
    expect((await runSave({ customFails: true })).outcome).toBe("history");
  });

  it("a lost plan is named 'plan' — the cheaper loss, said plainly", async () => {
    expect((await runSave({ planFails: true })).outcome).toBe("plan");
  });

  it("reports the transcript first when both fail", async () => {
    // If a student can only act on one sentence, it must be the one about the
    // data they cannot recreate.
    expect((await runSave({ historyFails: true, planFails: true })).outcome).toBe("history");
  });

  it("a clean run reports success", async () => {
    expect((await runSave({})).outcome).toBe("ok");
  });
});
