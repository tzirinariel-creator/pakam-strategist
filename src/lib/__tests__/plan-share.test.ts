import { describe, it, expect } from "vitest";
import { encodePlan, decodePlan, type SharedCourse } from "@/lib/plan-share";

const plan: SharedCourse[] = [
  { c: "0651-1007", y: 1, s: "FALL" },
  { c: "0618-1019", y: 2, s: "SPRING" },
];

describe("plan-share", () => {
  it("round-trips a plan through encode → decode", () => {
    expect(decodePlan(encodePlan(plan))).toEqual(plan);
  });

  it("produces a URL-safe token (no + / =)", () => {
    const token = encodePlan(plan);
    expect(token).not.toMatch(/[+/=]/);
  });

  it("returns null on a malformed token", () => {
    expect(decodePlan("not-valid-base64!!!")).toBeNull();
    expect(decodePlan("")).toBeNull();
  });

  it("drops entries with bad shapes", () => {
    const token = encodePlan([
      { c: "0651-1007", y: 1, s: "FALL" },
      // @ts-expect-error intentionally bad
      { c: "X", y: "two", s: "FALL" },
    ]);
    expect(decodePlan(token)).toEqual([{ c: "0651-1007", y: 1, s: "FALL" }]);
  });
});
