import { describe, it, expect } from "vitest";
import { contributorLevel } from "@/lib/contributor-level";

describe("contributorLevel", () => {
  it("climbs the ladder at the right thresholds", () => {
    expect(contributorLevel(0).titleHe).toBe("משקיף/ה");
    expect(contributorLevel(1).titleHe).toBe("ניצן המחזור");
    expect(contributorLevel(3).titleHe).toBe("תורם/ת פעיל/ה");
    expect(contributorLevel(6).titleHe).toBe("עמוד תווך");
    expect(contributorLevel(10).titleHe).toBe("אגדת המחזור");
    expect(contributorLevel(99).titleHe).toBe("אגדת המחזור");
  });

  it("progress toward the next level, 1 at the top", () => {
    const l = contributorLevel(2); // level 1 (at 1), next at 3 → (2-1)/(3-1)=0.5
    expect(l.progress).toBe(0.5);
    expect(l.nextAt).toBe(3);
    expect(contributorLevel(10).progress).toBe(1);
    expect(contributorLevel(10).nextAt).toBeNull();
  });
});
