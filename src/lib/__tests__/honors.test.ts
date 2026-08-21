// הצטיינות is a PERCENTILE decided in March, not a bar you clear. The app used
// to carry a hardcoded 95 and speak as if clearing it meant something.
import { describe, it, expect } from "vitest";
import { honorsProximity, shouldPromptToAskAboutHonors, HONORS_BANDS } from "@/lib/honors";

describe("honorsProximity — position against HISTORY, never a verdict", () => {
  it("reports above-historical for an average over every past cut-off", () => {
    expect(honorsProximity(98.5)).toBe("above-historical");
  });

  it("reports near-historical just under a past cut-off", () => {
    expect(honorsProximity(91.5)).toBe("near-historical"); // 92 band, minus 1
    expect(honorsProximity(96.9)).toBe("near-historical");
  });

  it("reports below-historical well under the lowest", () => {
    expect(honorsProximity(85)).toBe("below-historical");
  });

  it("says unknown rather than guessing when there is no average", () => {
    expect(honorsProximity(null)).toBe("unknown");
    expect(honorsProximity(Number.NaN)).toBe("unknown");
  });

  it("keeps the historical numbers טל gave, unrounded and unedited", () => {
    expect(HONORS_BANDS.map((b) => b.typicalAverage).sort((a, b) => a - b)).toEqual([92, 97, 98]);
  });
});

describe("when to tell the student to go ask", () => {
  it("prompts in Feb–Apr, around when the lists are drawn", () => {
    expect(shouldPromptToAskAboutHonors(2, "near-historical")).toBe(true);
    expect(shouldPromptToAskAboutHonors(3, "above-historical")).toBe(true);
    expect(shouldPromptToAskAboutHonors(4, "near-historical")).toBe(true);
  });

  it("stays quiet the rest of the year — there is nothing to ask yet", () => {
    expect(shouldPromptToAskAboutHonors(9, "above-historical")).toBe(false);
    expect(shouldPromptToAskAboutHonors(12, "near-historical")).toBe(false);
  });

  it("never prompts a student who is nowhere near, or whom we can't assess", () => {
    expect(shouldPromptToAskAboutHonors(3, "below-historical")).toBe(false);
    expect(shouldPromptToAskAboutHonors(3, "unknown")).toBe(false);
  });
});
