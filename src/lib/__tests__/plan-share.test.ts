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

  it("drops out-of-range / fractional years instead of letting the whole import fail (audit-r2)", () => {
    const token = encodePlan([
      { c: "0651-1007", y: 1, s: "FALL" },
      { c: "A", y: 99, s: "FALL" }, // out-of-range year
      { c: "B", y: -5, s: "SPRING" }, // negative year
      { c: "D", y: 1.7, s: "SUMMER" }, // fractional (savePlan's zod requires int 1..4)
    ]);
    // Only the valid row survives — the batch degrades to the salvageable subset
    // rather than being rejected wholesale downstream.
    expect(decodePlan(token)).toEqual([{ c: "0651-1007", y: 1, s: "FALL" }]);
  });
});
