// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { rememberSharedPlanReturn, consumeSharedPlanReturn } from "@/lib/plan-share";

describe("shared-plan return-after-auth", () => {
  beforeEach(() => localStorage.clear());

  it("strips the locale prefix (the i18n router re-adds its own — /he/he would 404)", () => {
    window.history.replaceState(null, "", "/he/shared-plan?d=abc");
    rememberSharedPlanReturn();
    expect(consumeSharedPlanReturn()).toBe("/shared-plan?d=abc");
  });

  it("consumes exactly once", () => {
    window.history.replaceState(null, "", "/en/shared-plan?d=t");
    rememberSharedPlanReturn();
    expect(consumeSharedPlanReturn()).toBe("/shared-plan?d=t");
    expect(consumeSharedPlanReturn()).toBeNull();
  });

  it("rejects protocol-relative paths and stale entries", () => {
    localStorage.setItem("pakamon.shared-plan-return", JSON.stringify({ path: "//evil.com", ts: Date.now() }));
    expect(consumeSharedPlanReturn()).toBeNull();
    localStorage.setItem("pakamon.shared-plan-return", JSON.stringify({ path: "/shared-plan?d=x", ts: Date.now() - 25 * 3600 * 1000 }));
    expect(consumeSharedPlanReturn()).toBeNull();
  });
});
