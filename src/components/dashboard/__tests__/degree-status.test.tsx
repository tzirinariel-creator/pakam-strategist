// @vitest-environment jsdom
// =========================================================================
// Guards the loading contract of the shared degree-status render (home hero +
// planner rail): while the credits query is in flight (credits === null) it
// MUST show a skeleton — never "0% · 0/150", which briefly contradicted the
// plan-derived numbers that had already loaded. A genuine 0-course student gets
// a real (non-null) zero-breakdown and so still sees a truthful 0%.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { CreditBreakdown } from "@/types/degree";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { DegreeStatus } from "@/components/dashboard/degree-status";

const zeroBreakdown = {
  earned: 0, planned: 0, miluimExemption: 0, effectiveTotal: 0,
  mandatory: 0, elective: 0, seminar: 0, focusArea: 0, focusAreaTarget: 60,
  englishCourseCount: 0,
} as unknown as CreditBreakdown;

const realBreakdown = {
  ...zeroBreakdown, earned: 77, planned: 30, effectiveTotal: 107,
} as unknown as CreditBreakdown;

beforeEach(() => cleanup());

describe("DegreeStatus loading contract", () => {
  it("credits === null (loading) renders a skeleton, NOT the '0% · of the degree done' text", () => {
    const { container } = render(<DegreeStatus credits={null} isHe variant="hero" currentYear={3} />);
    // No headline label = the real render was skipped in favour of the skeleton.
    expect(screen.queryByText("מהתואר הושלמו")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("a loaded breakdown renders the real status (headline present)", () => {
    render(<DegreeStatus credits={realBreakdown} isHe variant="hero" currentYear={3} />);
    expect(screen.getByText("מהתואר הושלמו")).toBeInTheDocument();
  });

  it("a genuine 0-course student (non-null zero breakdown) still shows a truthful status, not a skeleton", () => {
    const { container } = render(<DegreeStatus credits={zeroBreakdown} isHe variant="hero" currentYear={1} />);
    expect(screen.getByText("מהתואר הושלמו")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });
});
