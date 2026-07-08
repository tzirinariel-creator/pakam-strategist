import { describe, it, expect } from "vitest";
import { moderateTip } from "../course-knowledge-moderation";
import { ALLOWED_TAGS, TAG_LABELS, isAllowedTag } from "../course-knowledge-tags";

describe("moderateTip", () => {
  it("allows clean, on-topic Hebrew tips", () => {
    expect(moderateTip("מרצה מעולה, אבל הבוחן קשה. כדאי להתחיל מוקדם.").ok).toBe(true);
  });

  it("allows empty text (a rating without a tip is fine)", () => {
    expect(moderateTip("").ok).toBe(true);
    expect(moderateTip("   ").ok).toBe(true);
  });

  it("blocks links", () => {
    expect(moderateTip("חומר טוב פה https://example.com/notes").ok).toBe(false);
    expect(moderateTip("ראו www.drive.com/x").ok).toBe(false);
  });

  it("blocks emails and phones", () => {
    expect(moderateTip("כתבו לי ל-a.b@mail.com").ok).toBe(false);
    expect(moderateTip("אפשר לתאם 050-1234567").ok).toBe(false);
    expect(moderateTip("צרו קשר +972541112222").ok).toBe(false);
  });

  it("blocks overt abuse (HE + EN)", () => {
    expect(moderateTip("המרצה מטומטם").ok).toBe(false);
    expect(moderateTip("this lecturer is an idiot").ok).toBe(false);
  });

  it("returns a Hebrew reason when rejecting", () => {
    const r = moderateTip("שלחו מייל ל-x@y.com");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/[א-ת]/);
  });
});

describe("course tags", () => {
  it("every allowed tag has HE + EN labels", () => {
    for (const tag of ALLOWED_TAGS) {
      expect(TAG_LABELS[tag]?.he?.length).toBeGreaterThan(0);
      expect(TAG_LABELS[tag]?.en?.length).toBeGreaterThan(0);
    }
  });

  it("isAllowedTag guards the closed vocabulary", () => {
    expect(isAllowedTag("מרצה_מעולה")).toBe(true);
    expect(isAllowedTag("something_random")).toBe(false);
  });
});
