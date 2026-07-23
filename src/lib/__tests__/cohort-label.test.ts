import { describe, it, expect } from "vitest";
import { cohortLabel } from "@/lib/cohort-label";

// Design research (24.7 social-features deep dive): the cross-cohort knowledge
// flow was already tagged with cohortYear but never FRAMED as lineage — this
// makes the existing data legible ("2 years ahead of you") with zero new
// privacy surface (same anonymous content, no roster, no identity).
describe("cohortLabel — cross-cohort lineage framing (24.7)", () => {
  it("frames an older cohort as N years ahead, singular vs plural", () => {
    expect(cohortLabel(2023, 2025, true)).toBe("מחזור 2023 — 2 שנים לפניך");
    expect(cohortLabel(2024, 2025, true)).toBe("מחזור 2024 — שנה אחת לפניך");
    expect(cohortLabel(2023, 2025, false)).toBe("Class of 2023 — 2 years ahead of you");
    expect(cohortLabel(2024, 2025, false)).toBe("Class of 2024 — 1 year ahead of you");
  });

  it("falls back to a plain cohort tag for the same year or a younger one", () => {
    expect(cohortLabel(2025, 2025, true)).toBe("מחזור 2025");
    expect(cohortLabel(2026, 2025, true)).toBe("מחזור 2026");
  });

  it("falls back to a plain cohort tag when the viewer's own startYear is unknown", () => {
    expect(cohortLabel(2023, null, true)).toBe("מחזור 2023");
    expect(cohortLabel(2023, undefined, true)).toBe("מחזור 2023");
  });

  it("handles a missing cohortYear (pre-tagging legacy rows) as before", () => {
    expect(cohortLabel(null, 2025, true)).toBe("מחזור קודם");
    expect(cohortLabel(null, 2025, false)).toBe("Alum");
  });
});
