// @vitest-environment jsdom
// =========================================================================
// #43 — the Group-C benefits block read "פטור ש״ס 0/ 10 / קורסים בינאריים 0/ 5":
// the used/cap pair lived in two adjacent spans, so every linearization of the
// panel (copy, screen reader, plain-text export) glued the number to the slash.
// The counter is now ONE explicitly-LTR run with real spaces around the slash.
// =========================================================================
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, within, fireEvent, act } from "@testing-library/react";

// This file rendered without cleanup, so each describe inherited the previous
// one's DOM and any getBy* that matched twice threw "Found multiple elements".
afterEach(cleanup);
import { Shield } from "lucide-react";
import { QuotaCard } from "@/components/miluim/quota-card";

describe("QuotaCard — the used/cap counter (#43)", () => {
  it("reads '0 / 10' as text, not '0/ 10'", () => {
    const { container } = render(
      <QuotaCard icon={Shield} label="פטור ש״ס — בכל התואר" used={0} cap={10} hint="" pending={false} isHe />,
    );
    expect(container.textContent).toContain("0 / 10");
    expect(container.textContent).not.toContain("0/ 10");
  });

  it("the counter stays in an explicitly-LTR container so 10/5 never flips in RTL", () => {
    const { container } = render(
      <QuotaCard icon={Shield} label="קורסים בינאריים" used={3} cap={5} hint="" pending={false} isHe />,
    );
    const ltr = container.querySelector('[dir="ltr"]')!;
    expect(ltr.textContent).toBe("3 / 5");
  });

  it("the steppers are still wired (a label-bearing pair, only when editable)", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <QuotaCard icon={Shield} label="פטור" used={2} cap={10} hint="" pending={false} isHe onChange={onChange} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(2);
    rerender(
      <QuotaCard icon={Shield} label="פטור" used={2} cap={10} hint="" pending={false} isHe />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

// =========================================================================
// #26 (13.8) — "הפלוס מינוס … נראה שהם לא עובדים".
//
// They fired the mutation correctly. The problem was purely what the student
// saw: `used` was a server prop, so the number did not move on tap, and
// `pending` then disabled BOTH steppers. For the second or two until the
// refetch landed the counter sat still with greyed-out controls — which is
// indistinguishable from a broken button, and invites a second dead tap.
// =========================================================================

describe("QuotaCard — the tap must move the number (#26)", () => {
  const setup = (used: number, onChange = vi.fn()) => {
    const utils = render(
      <QuotaCard icon={Shield} label="פטור" used={used} cap={10} hint="" pending isHe onChange={onChange} />,
    );
    return { ...utils, onChange, ui: within(utils.container) };
  };

  it("shows the new value IMMEDIATELY, before the server confirms", () => {
    const { onChange, ui } = setup(2);
    fireEvent.click(ui.getByLabelText(/הוספת ניצול/));
    expect(onChange).toHaveBeenCalledWith(3);
    // The number on screen must already read 3 — this is the whole bug.
    expect(ui.getByText("3")).toBeInTheDocument();
  });

  it("keeps the steppers pressable while saving", () => {
    // They used to be `disabled={pending || …}`, so a student mid-save could
    // not press again — the control looked dead exactly when they retried.
    const { ui } = setup(2);
    expect(ui.getByLabelText(/הוספת ניצול/)).not.toBeDisabled();
    expect(ui.getByLabelText(/הפחתת ניצול/)).not.toBeDisabled();
  });

  it("still respects the bounds, using the optimistic value", () => {
    const { ui } = setup(9);
    fireEvent.click(ui.getByLabelText(/הוספת ניצול/));
    expect(ui.getByText("10")).toBeInTheDocument();
    // At the cap the increment must switch off — off the OPTIMISTIC value, or
    // a student could tap past the degree cap while the save is in flight.
    expect(ui.getByLabelText(/הוספת ניצול/)).toBeDisabled();
  });

  it("reverts on its own if the server never agrees (failed mutation)", () => {
    vi.useFakeTimers();
    try {
      const { ui } = setup(2);
      fireEvent.click(ui.getByLabelText(/הוספת ניצול/));
      expect(ui.getByText("3")).toBeInTheDocument();
      // The parent toasts the error and leaves `used` at 2. An optimistic
      // display must never harden into a lie about saved data.
      act(() => { vi.advanceTimersByTime(4100); });
      expect(ui.getByText("2")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("snaps to the server value once it catches up", () => {
    const { rerender, ui } = setup(2);
    fireEvent.click(ui.getByLabelText(/הוספת ניצול/));
    rerender(
      <QuotaCard icon={Shield} label="פטור" used={3} cap={10} hint="" pending={false} isHe onChange={vi.fn()} />,
    );
    expect(ui.getByText("3")).toBeInTheDocument();
  });
});
