// @vitest-environment jsdom
// =========================================================================
// Locks the k-anonymity DISPLAY contract of the cohort chip (the decision-
// moment social signal on planner cards + catalog rows). The server decides
// the bucket (EMPTY | SEEDING | REVEALED); the chip must render EXACTLY per
// bucket and NEVER invent a signal:
//   EMPTY    → nothing (honest silence — no cohort wisdom to show)
//   SEEDING  → a recruitment line, never a number-as-rating
//   REVEALED → the aggregate verdict / workload
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/lib/trpc/react", () => ({
  api: {
    courseKnowledge: {
      getForCourse: { useQuery: () => ({ data: h.data }) },
    },
  },
}));

import { CohortCourseChip } from "@/components/cohort/cohort-course-chip";

beforeEach(() => {
  cleanup();
  h.data = undefined;
});

describe("CohortCourseChip — k-anon display contract", () => {
  it("EMPTY bucket renders nothing (honest silence)", () => {
    h.data = { ratings: { contributorBucket: "EMPTY" } };
    const { container } = render(<CohortCourseChip courseCode="0618-1000" isHe />);
    expect(container).toBeEmptyDOMElement();
  });

  it("undefined data (loading/errored) renders nothing", () => {
    h.data = undefined;
    const { container } = render(<CohortCourseChip courseCode="0618-1000" isHe />);
    expect(container).toBeEmptyDOMElement();
  });

  it("SEEDING shows a recruitment line, not a rating number", () => {
    h.data = {
      ratings: { contributorBucket: "SEEDING", seedingContributors: 2, seedingRemaining: 1 },
    };
    render(<CohortCourseChip courseCode="0618-1000" isHe />);
    expect(screen.getByText(/שיתפו/)).toBeInTheDocument();
  });

  it("REVEALED shows the aggregate recommend-share", () => {
    h.data = {
      ratings: { contributorBucket: "REVEALED", recommendShare: 0.8, workloadAvg: 3 },
    };
    render(<CohortCourseChip courseCode="0618-1000" isHe />);
    expect(screen.getByText(/80% ממליצים/)).toBeInTheDocument();
  });

  it("REVEALED with only a workload average still renders (verdict optional)", () => {
    h.data = {
      ratings: { contributorBucket: "REVEALED", recommendShare: null, workloadAvg: 4 },
    };
    render(<CohortCourseChip courseCode="0618-1000" isHe />);
    expect(screen.getByText(/עומס/)).toBeInTheDocument();
  });
});
