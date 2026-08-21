/** @vitest-environment jsdom */
// The other gap I could not close in a browser: this chip lives in the
// onboarding planner, and the demo account never sees onboarding. Rendered
// here with Ariel's own English row, asserting what he would read on screen.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EnglishStandingChip } from "../english-standing-chip";
import { englishPlannerSignal } from "@/lib/english-planner-signal";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

afterEach(cleanup);

const ARIEL_ROW = {
  nameHe: "מתקדמים ב' חוצה דיצפלינות בין תחומי",
  courseCode: "2171-9201",
  grade: 90,
  status: "COMPLETED",
};

describe("EnglishStandingChip — what Ariel would see while planning", () => {
  it("says the level courses are done", () => {
    const { container } = render(
      <EnglishStandingChip signal={englishPlannerSignal("ADVANCED_B", null, [ARIEL_ROW])} />,
    );
    expect(container.textContent).toContain("סיימתם את קורסי הרמה");
  });

  it("never claims he is exempt — only the מזכירות grants that", () => {
    // The regulation is not written down anywhere this repo can cite, so the
    // app must not state it. It names the remaining step instead.
    const { container } = render(
      <EnglishStandingChip signal={englishPlannerSignal("ADVANCED_B", null, [ARIEL_ROW])} />,
    );
    expect(container.textContent).toContain("במזכירות");
    expect(container.textContent).not.toMatch(/יש לכם פטור/);
  });

  it("states what is still owed when nothing was passed", () => {
    const { container } = render(
      <EnglishStandingChip signal={englishPlannerSignal("ADVANCED_B", null, [])} />,
    );
    expect(container.textContent).toMatch(/נשאר/);
    expect(container.textContent).toMatch(/קורס/);
  });

  it("renders nothing when the placement is unknown", () => {
    // Silence beats a confident number about a student we know nothing about.
    const { container } = render(
      <EnglishStandingChip signal={englishPlannerSignal(null, null, [])} />,
    );
    expect(container.textContent).toBe("");
  });

  it("says so plainly for a student who really is exempt", () => {
    const { container } = render(
      <EnglishStandingChip signal={englishPlannerSignal("EXEMPT", null, [])} />,
    );
    expect(container.textContent).toContain("פטור");
  });
});
