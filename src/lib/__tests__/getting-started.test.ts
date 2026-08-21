import { describe, it, expect } from "vitest";
import { gettingStartedProgress, gettingStartedSteps } from "../getting-started";

const EMPTY = { courseCount: 0, gradedCount: 0, hasFocusArea: false, hasRegulationResult: false };
const done = (input: Parameters<typeof gettingStartedSteps>[0], id: string) =>
  gettingStartedSteps(input).find((s) => s.id === id)!.done;

describe("getting-started checklist", () => {
  it("starts at zero for a brand new account", () => {
    const p = gettingStartedProgress(EMPTY);
    expect(p.done).toBe(0);
    expect(p.total).toBe(4);
    expect(p.complete).toBe(false);
    expect(p.next?.id).toBe("plan");
  });

  it("ticks a step the moment the underlying thing is true", () => {
    expect(done({ ...EMPTY, courseCount: 1 }, "plan")).toBe(true);
    expect(done({ ...EMPTY, gradedCount: 1 }, "record")).toBe(true);
    expect(done({ ...EMPTY, hasFocusArea: true }, "focus")).toBe(true);
  });

  it("credits work already done instead of withholding it", () => {
    // Someone who imported a full plan before ever seeing this card should
    // arrive with steps already ticked, not be asked to redo them.
    const p = gettingStartedProgress({
      courseCount: 32, gradedCount: 28, hasFocusArea: true, hasRegulationResult: true,
    });
    expect(p.done).toBe(4);
    expect(p.complete).toBe(true);
    expect(p.next).toBeNull();
  });

  it("does not count the regulation check without a focus area", () => {
    // The check cannot report on the 60-credit focus requirement until a focus
    // area exists, so calling it "done" would be claiming an answer we do not
    // have.
    expect(done({ ...EMPTY, hasRegulationResult: true, hasFocusArea: false }, "regulations")).toBe(false);
    expect(done({ ...EMPTY, hasRegulationResult: true, hasFocusArea: true }, "regulations")).toBe(true);
  });

  it("points at the first unfinished step, in order", () => {
    expect(gettingStartedProgress({ ...EMPTY, courseCount: 5 }).next?.id).toBe("record");
    expect(gettingStartedProgress({ ...EMPTY, courseCount: 5, gradedCount: 5 }).next?.id).toBe("focus");
  });

  it("has no step that completes as a side effect of another", () => {
    // A "set up your timetable" step was cut for exactly this reason: the
    // timetable is derived from the plan, so it would tick itself the moment
    // step one did, teaching the reader the list is decorative. Guard against
    // reintroducing one — flipping any single input must move at most one step
    // beyond the count already implied.
    const ids = gettingStartedSteps(EMPTY).map((s) => s.id);
    for (const key of ["courseCount", "gradedCount"] as const) {
      const before = gettingStartedProgress(EMPTY).done;
      const after = gettingStartedProgress({ ...EMPTY, [key]: 1 }).done;
      expect(after - before).toBeLessThanOrEqual(1);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
