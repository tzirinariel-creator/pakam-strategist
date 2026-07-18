// @vitest-environment jsdom
// =========================================================================
// Locks the HONESTY RAILS of the exam-plan wizard. The wizard is a thin,
// prop-driven wrapper around the real planner: it only tells the engine where
// NOT to study (blocked days) and how to *shape* an existing spread (weekday
// capacity). It NEVER invents a date, a difficulty, or a point prediction — so
// the tests below assert on the CONTROLS the wizard exposes, not on any
// generated content:
//   1. step-1 "Next" is disabled until at least one exam is selected;
//   2. the finish/generate control is disabled when nothing is selected OR busy;
//   3. bumpDay clamps a weekday to [0,12] in 0.5 steps; the "less" arrow is
//      disabled at 0 (can't go negative);
//   4. addDay de-dupes a blocked date + clears the input; removeDay removes it;
//   5. step navigation clamps to 1..4 (no phantom step 0 or 5).
// A tiny controlled wrapper mirrors the parent's owned state so we can observe
// the callback outputs the wizard actually emits.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { useState } from "react";

import { ExamPlanWizard, type PrepStyle } from "@/components/exam-planner/exam-plan-wizard";

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

// A controlled harness that owns the same state the real parent owns and
// records the callback outputs so a test can assert on them.
function Harness({
  isHe = true,
  selectedCount = 1,
  initialWeekdayHours = [2, 2, 2, 2, 2, 0, 0],
  initialBlockedDays = [],
  finishBusy = false,
  onFinish = vi.fn(),
}: {
  isHe?: boolean;
  selectedCount?: number;
  initialWeekdayHours?: number[];
  initialBlockedDays?: string[];
  finishBusy?: boolean;
  onFinish?: () => void;
}) {
  const [prepStyle, setPrepStyle] = useState<PrepStyle>("steady");
  const [blockedDays, setBlockedDays] = useState<string[]>(initialBlockedDays);
  const [weekdayHours, setWeekdayHours] = useState<number[]>(initialWeekdayHours);
  return (
    <ExamPlanWizard
      isHe={isHe}
      pickPanel={<div data-testid="pick-panel">pick exams here</div>}
      previewSkyline={<div data-testid="preview-skyline">skyline</div>}
      recsCard={<div data-testid="recs-card">recs</div>}
      selectedCount={selectedCount}
      prepStyle={prepStyle}
      onPrepStyle={setPrepStyle}
      blockedDays={blockedDays}
      onBlockedDays={setBlockedDays}
      weekdayHours={weekdayHours}
      onWeekdayHours={setWeekdayHours}
      onFinish={onFinish}
      finishBusy={finishBusy}
      finishLabel="בנו את התוכנית"
    />
  );
}

// Advance the wizard from step 1 to a target step by clicking "next" N times.
// Assumes selectedCount>0 so the gate is open.
function goToStep(target: number) {
  for (let s = 1; s < target; s++) {
    fireEvent.click(screen.getByRole("button", { name: /הבא/ }));
  }
}

describe("ExamPlanWizard — honesty rails", () => {
  // ── Rail 1: step-1 Next gated on selectedCount>0 ──────────────────────
  it("step 1: Next is DISABLED until at least one exam is selected", () => {
    render(<Harness selectedCount={0} />);
    // Step 1 shows the caller's own pick panel verbatim (not rewritten).
    expect(screen.getByTestId("pick-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /הבא/ })).toBeDisabled();
  });

  it("step 1: Next ENABLES once an exam is selected, and advances", () => {
    render(<Harness selectedCount={2} />);
    const next = screen.getByRole("button", { name: /הבא/ });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    // Advanced to step 2 (prep style) — the step-1 pick panel is gone.
    expect(screen.queryByTestId("pick-panel")).not.toBeInTheDocument();
    expect(screen.getByText("2/4", { exact: false })).toBeInTheDocument();
  });

  // ── Rail 2: finish/generate disabled when empty OR busy ───────────────
  it("step 4: finish is ENABLED when exams are selected and not busy", () => {
    render(<Harness selectedCount={1} finishBusy={false} />);
    goToStep(4);
    expect(screen.getByRole("button", { name: /בנו את התוכנית/ })).toBeEnabled();
  });

  it("step 4: finish is DISABLED while a build is in flight (finishBusy)", () => {
    render(<Harness selectedCount={1} finishBusy={true} />);
    goToStep(4);
    expect(screen.getByRole("button", { name: /בנו את התוכנית/ })).toBeDisabled();
  });

  it("step 4: finish fires onFinish when clicked", () => {
    const onFinish = vi.fn();
    render(<Harness selectedCount={1} onFinish={onFinish} />);
    goToStep(4);
    fireEvent.click(screen.getByRole("button", { name: /בנו את התוכנית/ }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  // Note: selectedCount===0 can never *reach* step 4 (Rail 1 blocks step 1),
  // so `selectedCount===0` disabling the finish button is a belt-and-braces
  // guard rather than a reachable UI state. The source ANDs both conditions
  // (`finishBusy || selectedCount === 0`); the busy case above locks the OR.

  // ── Rail 3: bumpDay clamps to [0,12] in 0.5 steps; decrement disabled at 0 ─
  // The weekday aria-labels embed a Hebrew day letter after "ל". We key the
  // matchers off that letter (unique per day) with a regex, so the test does
  // not depend on the exact geresh (׳) codepoint the source uses.
  const MORE_SUN = /יותר שעות לא/; // Sunday (א)
  const LESS_SUN = /פחות שעות לא/;
  const MORE_MON = /יותר שעות לב/; // Monday (ב)
  const LESS_FRI = /פחות שעות לו/; // Friday (ו)

  it("step 3: an up arrow bumps that weekday by +0.5", () => {
    render(<Harness selectedCount={1} initialWeekdayHours={[2, 2, 2, 2, 2, 0, 0]} />);
    goToStep(3);
    // Sunday (index 0) starts at 2. Its "more" arrow adds 0.5 → 2.5.
    fireEvent.click(screen.getByRole("button", { name: MORE_SUN }));
    const sun = screen.getByRole("button", { name: MORE_SUN }).closest("div")!;
    expect(within(sun).getByText("2.5")).toBeInTheDocument();
  });

  it("step 3: the down arrow is DISABLED at 0 (can't go negative)", () => {
    // Friday (index 5) starts at 0.
    render(<Harness selectedCount={1} initialWeekdayHours={[2, 2, 2, 2, 2, 0, 0]} />);
    goToStep(3);
    expect(screen.getByRole("button", { name: LESS_FRI })).toBeDisabled();
    // ...while a non-zero day's down arrow is enabled.
    expect(screen.getByRole("button", { name: LESS_SUN })).toBeEnabled();
  });

  it("step 3: up arrow clamps at the 12h ceiling — never invents hours past the cap", () => {
    // Monday (index 1) already at the max; another +0.5 must stay at 12.
    render(<Harness selectedCount={1} initialWeekdayHours={[2, 12, 2, 2, 2, 0, 0]} />);
    goToStep(3);
    const monMore = screen.getByRole("button", { name: MORE_MON });
    fireEvent.click(monMore);
    const mon = monMore.closest("div")!;
    expect(within(mon).getByText("12")).toBeInTheDocument();
    expect(within(mon).queryByText("12.5")).not.toBeInTheDocument();
  });

  it("step 3: decrement stays clamped at 0 (a day at 0.5 goes to 0, no lower)", () => {
    render(<Harness selectedCount={1} initialWeekdayHours={[0.5, 2, 2, 2, 2, 0, 0]} />);
    goToStep(3);
    const sunLess = screen.getByRole("button", { name: LESS_SUN });
    fireEvent.click(sunLess); // 0.5 → 0
    const sun = sunLess.closest("div")!;
    expect(within(sun).getByText("0")).toBeInTheDocument();
    // Now clamped: the arrow disables and the value can't drop below 0.
    expect(screen.getByRole("button", { name: LESS_SUN })).toBeDisabled();
  });

  // ── Rail 4: addDay de-dupes + clears input; removeDay removes ─────────
  it("step 3: addDay records a blocked date and clears the input", () => {
    render(<Harness selectedCount={1} />);
    goToStep(3);
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: /הוסיפו/ }));
    // The chip appears (formatted) and the input is cleared.
    expect(screen.getByRole("button", { name: "הסירו" })).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("step 3: addDay DE-DUPES — the same date can't be blocked twice", () => {
    render(<Harness selectedCount={1} initialBlockedDays={["2026-07-20"]} />);
    goToStep(3);
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: /הוסיפו/ }));
    // Still exactly one remove control — no duplicate chip.
    expect(screen.getAllByRole("button", { name: "הסירו" })).toHaveLength(1);
  });

  it("step 3: Add is disabled with an empty input (nothing to block)", () => {
    render(<Harness selectedCount={1} />);
    goToStep(3);
    expect(screen.getByRole("button", { name: /הוסיפו/ })).toBeDisabled();
  });

  it("step 3: removeDay drops the blocked date", () => {
    render(<Harness selectedCount={1} initialBlockedDays={["2026-07-20"]} />);
    goToStep(3);
    expect(screen.getByRole("button", { name: "הסירו" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הסירו" }));
    expect(screen.queryByRole("button", { name: "הסירו" })).not.toBeInTheDocument();
  });

  // ── Rail 5: step navigation clamps to 1..4 ────────────────────────────
  it("nav: cannot go below step 1 — there is no Back button on step 1", () => {
    render(<Harness selectedCount={1} />);
    expect(screen.queryByRole("button", { name: /חזרה/ })).not.toBeInTheDocument();
    expect(screen.getByText("1/4", { exact: false })).toBeInTheDocument();
  });

  it("nav: cannot go past step 4 — Next is replaced by the finish button", () => {
    render(<Harness selectedCount={1} />);
    goToStep(4);
    expect(screen.getByText("4/4", { exact: false })).toBeInTheDocument();
    // At the last step there is no "next" — only "build".
    expect(screen.queryByRole("button", { name: /הבא/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /בנו את התוכנית/ })).toBeInTheDocument();
  });

  it("nav: Back walks the step counter down and never underflows", () => {
    render(<Harness selectedCount={1} />);
    goToStep(3);
    expect(screen.getByText("3/4", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /חזרה/ }));
    expect(screen.getByText("2/4", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /חזרה/ }));
    // Back on step 1: the pick panel is shown and Back disappears (clamped).
    expect(screen.getByTestId("pick-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /חזרה/ })).not.toBeInTheDocument();
  });
});
