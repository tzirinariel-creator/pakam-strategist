// @vitest-environment jsdom
// =========================================================================
// 13.8 (#4) — the first-visit introduction to a tab's headline capability.
// The whole value of this component is that it appears ONCE. These tests pin
// that: dismissed is dismissed, across remounts; each tab keeps its own flag;
// and blocked storage degrades to "show it" rather than throwing on a screen
// the student came for.
// =========================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

import { FirstVisitIntro, hasSeenIntro } from "@/components/ui/first-visit-intro";

const intro = (key = "exam-planner-xlsx") => (
  <FirstVisitIntro storageKey={key} icon={<span />} title="כותרת" body="גוף" />
);
const shown = () => screen.queryByText("כותרת");

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("FirstVisitIntro — once per tab, never a nag", () => {
  it("shows on the first visit", () => {
    render(intro());
    expect(shown()).toBeInTheDocument();
  });

  it("'הבנתי' retires it — including after a full remount", () => {
    const { unmount } = render(intro());
    fireEvent.click(screen.getByText("הבנתי"));
    expect(shown()).not.toBeInTheDocument();
    unmount();
    render(intro());
    expect(shown()).not.toBeInTheDocument();
  });

  it("the X retires it just the same", () => {
    const { unmount } = render(intro());
    fireEvent.click(screen.getByLabelText("סגור"));
    unmount();
    render(intro());
    expect(shown()).not.toBeInTheDocument();
  });

  it("writes exactly one namespaced flag", () => {
    render(intro());
    fireEvent.click(screen.getByText("הבנתי"));
    expect(localStorage.getItem("pk-intro-exam-planner-xlsx")).toBe("1");
    expect(hasSeenIntro("exam-planner-xlsx")).toBe(true);
  });

  it("dismissing one tab's intro does not silence another's", () => {
    const { unmount } = render(intro("exam-planner-xlsx"));
    fireEvent.click(screen.getByText("הבנתי"));
    unmount();
    render(intro("some-other-tab"));
    expect(shown()).toBeInTheDocument();
    expect(hasSeenIntro("some-other-tab")).toBe(false);
  });

  it("a pre-set flag means it never renders at all", () => {
    localStorage.setItem("pk-intro-exam-planner-xlsx", "1");
    render(intro());
    expect(shown()).not.toBeInTheDocument();
  });

  it("survives blocked storage — shows, and dismissing doesn't throw", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(intro());
    expect(shown()).toBeInTheDocument();
    expect(() => fireEvent.click(screen.getByText("הבנתי"))).not.toThrow();
    expect(shown()).not.toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("renders the optional preview when one is given", () => {
    render(
      <FirstVisitIntro
        storageKey="k"
        icon={<span />}
        title="כותרת"
        body="גוף"
        preview={<div data-testid="preview" />}
      />,
    );
    expect(screen.getByTestId("preview")).toBeInTheDocument();
  });
});
