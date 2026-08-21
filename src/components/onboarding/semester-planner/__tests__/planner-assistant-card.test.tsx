/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
