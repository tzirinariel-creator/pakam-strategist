/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlannerAssistantCard } from "../planner-assistant-card";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
afterEach(cleanup);

describe("PlannerAssistantCard", () => {
  it("says the week is fine when it is", () => {
    // "0 clashes" is a good answer, not a problem to manufacture so a button
    // looks useful.
    const { container } = render(
      <PlannerAssistantCard conflicts={0} canSwapGroups campusDays={4} onFindCombination={() => {}} />,
    );
    expect(container.textContent).toContain("אין התנגשויות");
    expect(container.textContent).toContain("נסו לשפר");
  });

  it("names the clashes when there are some", () => {
    const { container } = render(
      <PlannerAssistantCard conflicts={2} canSwapGroups campusDays={5} onFindCombination={() => {}} />,
    );
    expect(container.textContent).toContain("2 התנגשויות");
    expect(container.textContent).toContain("בלי התנגשויות");
  });

  it("never prints the count twice", () => {
    // Shipped as "אין התנגשויות · 3 3 ימים בקמפוס" — heNoun already renders the
    // number, and the row printed its own alongside it.
    const { container } = render(
      <PlannerAssistantCard conflicts={3} canSwapGroups campusDays={3} onFindCombination={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/(\d+)\s+\1\b/);
    expect(container.textContent).toContain("3 ימים בקמפוס");
    expect(container.textContent).toContain("3 התנגשויות");
  });

  it("uses natural Hebrew at one", () => {
    const { container } = render(
      <PlannerAssistantCard conflicts={1} canSwapGroups campusDays={1} onFindCombination={() => {}} />,
    );
    expect(container.textContent).toContain("התנגשות");
    expect(container.textContent).not.toContain("1 התנגשויות");
    expect(container.textContent).not.toContain("1 ימים");
  });

  it("renders nothing when there is no group to swap", () => {
    // Promising a search with nothing to search would be a lie.
    const { container } = render(
      <PlannerAssistantCard conflicts={3} canSwapGroups={false} campusDays={5} onFindCombination={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  it("passes the constraint the button promises", () => {
    const spy = vi.fn();
    render(
      <PlannerAssistantCard conflicts={0} canSwapGroups campusDays={5} onFindCombination={spy} />,
    );
    fireEvent.click(screen.getByText(/בלי בקרים מוקדמים/));
    expect(spy).toHaveBeenCalledWith({ earliestHour: 10 });
  });

  it("promises that nothing moves without consent", () => {
    const { container } = render(
      <PlannerAssistantCard conflicts={0} canSwapGroups campusDays={4} onFindCombination={() => {}} />,
    );
    expect(container.textContent).toContain("לא משתנה עד שתאשרו");
  });
});

describe("#8 — combination constraints, now on the assistant card", () => {
  // These moved with the search trigger. The bar reports the week; the card
  // runs the search, so a constraint stated here is read by the button that
  // sits beside it — which is the property these tests exist to hold.
  beforeEach(cleanup);

  const withSwap = (onFind = vi.fn()) =>
    render(
      <PlannerAssistantCard conflicts={0} canSwapGroups campusDays={2} onFindCombination={onFind} />,
    );

  it("does not render the control when there is nothing to swap", () => {
    render(
      <PlannerAssistantCard
        conflicts={0}
        canSwapGroups={false}
        campusDays={2}
        onFindCombination={vi.fn()}
      />,
    );
    expect(screen.queryByText("יש לי בקשות לשבוע")).toBeNull();
  });

  it("offers the constraints toggle alongside the search, collapsed", () => {
    withSwap();
    const toggle = screen.getByRole("button", { name: "יש לי בקשות לשבוע" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Collapsed means collapsed — no day chips on screen yet.
    expect(screen.queryByRole("button", { name: "ג" })).toBeNull();
  });

  it("survives open → closed → open without a hook-order crash (React #310)", () => {
    withSwap();
    const toggle = screen.getByRole("button", { name: "יש לי בקשות לשבוע" });
    expect(() => {
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      fireEvent.click(toggle);
    }).not.toThrow();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("passes the chosen free day to the search, and nothing when none is chosen", () => {
    // Note the order: constraints first, then search. The card disables its
    // buttons for 600ms after a press so the pressed state is visible, so a
    // search → change → search-again sequence within that window is a no-op —
    // which is correct behaviour, and also the order nobody uses.
    const onFind = vi.fn();
    withSwap(onFind);
    fireEvent.click(screen.getByRole("button", { name: /נסו לשפר לי את השבוע/ }));
    expect(onFind).toHaveBeenLastCalledWith({});

    cleanup();
    withSwap(onFind);
    fireEvent.click(screen.getByRole("button", { name: "יש לי בקשות לשבוע" }));
    fireEvent.click(screen.getByRole("button", { name: "ג" })); // Tuesday
    fireEvent.click(screen.getByRole("button", { name: /נסו לשפר לי את השבוע/ }));
    expect(onFind).toHaveBeenLastCalledWith({ freeDays: ["TUESDAY"] });
  });

  it("carries the constraints into the framed searches too", () => {
    // "פחות ימים בקמפוס" ships its own prefs. A free day stated above it must
    // survive that merge rather than being overwritten by the framing.
    const onFind = vi.fn();
    withSwap(onFind);
    fireEvent.click(screen.getByRole("button", { name: "יש לי בקשות לשבוע" }));
    fireEvent.click(screen.getByRole("button", { name: "ג" }));
    fireEvent.click(screen.getByRole("button", { name: /בלי בקרים מוקדמים/ }));
    expect(onFind).toHaveBeenLastCalledWith({ freeDays: ["TUESDAY"], earliestHour: 10 });
  });

  it("a day chip toggles off again — a mis-tap is not a commitment", () => {
    const onFind = vi.fn();
    withSwap(onFind);
    fireEvent.click(screen.getByRole("button", { name: "יש לי בקשות לשבוע" }));
    const tue = screen.getByRole("button", { name: "ג" });
    fireEvent.click(tue);
    expect(tue).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(tue);
    expect(tue).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /נסו לשפר לי את השבוע/ }));
    expect(onFind).toHaveBeenLastCalledWith({ freeDays: [] });
  });

  it("states plainly that a constraint is a wish, not a rule", () => {
    // The honesty rail: the student must know before they press that a clash-free
    // week outranks their free day, and that we will say what we couldn't keep.
    withSwap();
    fireEvent.click(screen.getByRole("button", { name: "יש לי בקשות לשבוע" }));
    expect(screen.getByText(/אלה בקשות, לא חוקים/)).toBeInTheDocument();
  });
});
