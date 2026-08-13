// @vitest-environment jsdom
// =========================================================================
// React #310 regression — the tour crashed the planner the moment it opened.
// =========================================================================
// The #16 placement fix added `useRef` + `useState` + `useLayoutEffect` to
// measure the card's height, and put them next to the placement math — which
// sits AFTER `if (!open || !mounted) return null`. So React ran 5 hooks while
// the tour was closed and 7 once it opened: "rendered more hooks than during
// the previous render".
//
// Nothing caught it. tsc can't see hook ORDER, the placement math was tested as
// a pure function, and no test ever rendered this component with `open` going
// false → true. It shipped, and it took down the whole planner screen — the
// most important screen in the app — the instant the first-visit tour fired.
//
// The lesson this file encodes: a component with an early return needs a test
// that TOGGLES the condition, not one that renders each state fresh.
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AnchoredTour, PLANNER_STEPS } from "@/components/onboarding/anchored-tour";

afterEach(cleanup);

function renderTour(open: boolean) {
  return render(
    <NextIntlClientProvider locale="he" messages={{}}>
      <AnchoredTour open={open} onClose={vi.fn()} steps={PLANNER_STEPS} />
    </NextIntlClientProvider>,
  );
}

describe("AnchoredTour — hook order survives open/close", () => {
  it("does not crash when it goes from closed to OPEN (React #310)", () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));
    try {
      const { rerender } = renderTour(false);
      // The exact transition that crashed production: the planner mounts the
      // tour closed, then opens it once the course data has loaded.
      expect(() =>
        rerender(
          <NextIntlClientProvider locale="he" messages={{}}>
            <AnchoredTour open onClose={vi.fn()} steps={PLANNER_STEPS} />
          </NextIntlClientProvider>,
        ),
      ).not.toThrow();
      expect(errors.some((e) => JSON.stringify(e).includes("310"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("survives the round trip open → closed → open", () => {
    const { rerender } = renderTour(true);
    const toggle = (open: boolean) =>
      rerender(
        <NextIntlClientProvider locale="he" messages={{}}>
          <AnchoredTour open={open} onClose={vi.fn()} steps={PLANNER_STEPS} />
        </NextIntlClientProvider>,
      );
    expect(() => {
      toggle(false);
      toggle(true);
      toggle(false);
    }).not.toThrow();
  });

  it("renders the first step's copy once open, and nothing while closed", () => {
    const { rerender } = renderTour(false);
    expect(screen.queryByText(/כאן בוחרים את הקורסים/)).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="he" messages={{}}>
        <AnchoredTour open onClose={vi.fn()} steps={PLANNER_STEPS} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/כאן בוחרים את הקורסים/)).toBeInTheDocument();
  });
});
