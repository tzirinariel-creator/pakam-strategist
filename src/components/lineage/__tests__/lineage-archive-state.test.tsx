// @vitest-environment jsdom
// =========================================================================
// #30 — "hidden" and "empty" are different sentences.
// =========================================================================
// The lineage fronted an archive without ever saying what was in it, and the
// one state production is actually in — anonymous grade points present, no
// review written, therefore nothing above the bar — was reported as a flat
// "there is nothing here". That tells the students who did contribute that
// their contribution amounted to nothing, when in fact it is sitting under a
// threshold that is the whole reason the archive is trustworthy.
//
// These tests pin the distinction, and pin that the card never leaks a course:
// it reports how many are close, never which.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

import { LineageArchiveState } from "@/components/lineage/lineage-archive-state";

beforeEach(cleanup);

describe("LineageArchiveState", () => {
  it("renders nothing at all until the digest has loaded", () => {
    const { container } = render(<LineageArchiveState totals={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the archive is empty only when it really holds nothing", () => {
    const { container } = render(
      <LineageArchiveState totals={{ reviews: 0, gradePoints: 0, coursesCovered: 0 }} />,
    );
    expect(container.textContent).toMatch(/הארכיון ריק/);
    expect(container.textContent).not.toMatch(/מתחת לסף/);
  });

  it("says 'below the bar', not 'empty', when grades are in but nothing cleared", () => {
    const { container } = render(
      <LineageArchiveState totals={{ reviews: 0, gradePoints: 12, coursesCovered: 0 }} />,
    );
    expect(container.textContent).toMatch(/מתחת לסף/);
    expect(container.textContent).not.toMatch(/הארכיון ריק/);
    // The real thresholds, from the one file that owns them.
    expect(container.textContent).toMatch(/5 תורמים/);
    expect(container.textContent).toMatch(/3 מדרגים/);
    // And the contribution that IS there is counted, not written off.
    expect(container.textContent).toMatch(/12/);
  });

  it("shows the three real counts once something cleared the bar", () => {
    const { container } = render(
      <LineageArchiveState totals={{ reviews: 9, gradePoints: 40, coursesCovered: 3 }} />,
    );
    expect(container.textContent).toMatch(/3/);
    expect(container.textContent).toMatch(/9/);
    expect(container.textContent).toMatch(/40/);
    // Always sourced — no number without where it came from.
    expect(container.textContent).toMatch(/נספרים מתיק המחזור עצמו/);
  });

  it("turns the distance to the next unlock into a concrete ask", () => {
    const { container } = render(
      <LineageArchiveState
        totals={{ reviews: 9, gradePoints: 40, coursesCovered: 3 }}
        almostUnlocked={{ courses: 2, reviewsNeeded: 3 }}
      />,
    );
    expect(container.textContent).toMatch(/עוד 3 חוות-דעת/);
    expect(container.textContent).toMatch(/עוד 2 קורסים/);
  });

  it("stays quiet when nothing is close — no invented queue", () => {
    const { container } = render(
      <LineageArchiveState
        totals={{ reviews: 9, gradePoints: 40, coursesCovered: 3 }}
        almostUnlocked={{ courses: 0, reviewsNeeded: 0 }}
      />,
    );
    expect(container.textContent).not.toMatch(/פותחות/);
    expect(container.textContent).not.toMatch(/פותחת/);
  });

  it("reports how many courses are close, never which — no course is named", () => {
    const { container } = render(
      <LineageArchiveState
        totals={{ reviews: 4, gradePoints: 10, coursesCovered: 1 }}
        almostUnlocked={{ courses: 1, reviewsNeeded: 1 }}
      />,
    );
    // The card is fed counts only; there is no course field it could print.
    expect(container.textContent).toMatch(/עוד חוות-דעת אחת פותחת/);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});
