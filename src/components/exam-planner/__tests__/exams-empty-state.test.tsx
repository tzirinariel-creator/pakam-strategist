// @vitest-environment jsdom
// =========================================================================
// #39 — the RENDERED empty state, not just the classifier underneath it.
//
// Ariel opened the planner during a real exam period and read "אין מבחנים
// קרובים בתכנית שלכם. (מבחנים שכבר עברו אינם מוצגים.)" — a sentence that reads
// like a bug and is identical whether he planned nothing or the university
// simply hasn't published the timetable. These tests lock in that the two
// causes now produce visibly different screens, that the unpublished one is
// stated as missing DATA rather than the student's fault, and that no date is
// ever invented.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ExamsEmptyState } from "@/components/exam-planner/exams-empty-state";

// 13.8.2026 — the day of the report: inside תשפ״ו spring's exam period, with
// the catalog already migrated to the (date-less) תשפ״ז yedion.
const NOW = new Date(2026, 7, 13, 12, 0, 0);

beforeEach(() => cleanup());

describe("ExamsEmptyState (#39)", () => {
  it("unpublished timetable: names the year, blames the data, offers manual entry", () => {
    render(
      <ExamsEmptyState
        isHe
        reason="not-published"
        plannedCount={5}
        now={NOW}
        manualEntry={<div data-testid="manual-rows" />}
      />,
    );
    expect(screen.getByText(/לוח הבחינות של תשפ״ז טרם פורסם/)).toBeInTheDocument();
    // Explicitly NOT the student's fault, and explicitly not last year's dates.
    expect(screen.getByText(/זו לא תקלה אצלכם/)).toBeInTheDocument();
    expect(screen.getByText(/לא נמציא תאריכים/)).toBeInTheDocument();
    // The way forward exists.
    expect(screen.getByTestId("manual-rows")).toBeInTheDocument();
    expect(screen.getByText(/יודעים את התאריך\?/)).toBeInTheDocument();
    // And the dead-end sentence is gone for good.
    expect(screen.queryByText(/אין מבחנים קרובים בתכנית שלכם/)).not.toBeInTheDocument();
  });

  it("no plan: a different screen entirely — the fix is to go build a plan", () => {
    render(<ExamsEmptyState isHe reason="no-plan" plannedCount={0} now={NOW} />);
    expect(screen.getByText(/עוד אין לכם תכנית לימודים/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /לבניית התכנית/ })).toHaveAttribute("href", "/planner");
    // Must NOT blame an unpublished timetable — that's the other cause. (The
    // status line's own honest "the exam-period END isn't published" note is a
    // different, always-true statement, so match the headline specifically.)
    expect(screen.queryByText(/לוח הבחינות של .* טרם פורסם/)).not.toBeInTheDocument();
    expect(screen.queryByText(/לא נמציא תאריכים/)).not.toBeInTheDocument();
  });

  it("all-past is told apart from unpublished", () => {
    render(<ExamsEmptyState isHe reason="all-past" plannedCount={3} now={NOW} />);
    expect(screen.getByText(/כל מועדי הבחינה שבתכנית שלכם כבר עברו/)).toBeInTheDocument();
    expect(screen.queryByText(/לוח הבחינות של תשפ״ז טרם פורסם/)).not.toBeInTheDocument();
  });

  it("papers-only plans say there is nothing to sit, not that dates are missing", () => {
    render(<ExamsEmptyState isHe reason="no-exam-courses" plannedCount={2} now={NOW} />);
    expect(screen.getByText(/אף קורס בתכנית שלכם לא נבחן בבחינה/)).toBeInTheDocument();
  });

  it("every variant proves it knows the date: the live academic status is always on screen", () => {
    for (const reason of ["not-published", "no-plan", "all-past", "no-exam-courses"] as const) {
      cleanup();
      render(<ExamsEmptyState isHe reason={reason} plannedCount={1} now={NOW} />);
      // "אנחנו בתוך תקופת המבחנים של סמסטר ב׳ תשפ״ו…" — the exact thing the old
      // screen failed to say while the student was sitting in an exam period.
      expect(screen.getByText(/תקופת המבחנים של/)).toBeInTheDocument();
      expect(screen.getByText(/סמסטר ב׳/)).toBeInTheDocument();
    }
  });
});
