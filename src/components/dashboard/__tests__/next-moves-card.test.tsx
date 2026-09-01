// @vitest-environment jsdom
// =========================================================================
// What the HOME SCREEN actually renders. The ordering + retirement rules are
// pinned in lib/__tests__/next-moves.test.ts; this pins the surface, because
// the three defects the audit found were all surface defects: a counter that
// disagreed with the rows, a card that could not retire, and rows that ticked
// without a trace.
// =========================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/persona/use-persona", () => ({
  usePersona: () => ({ persona: "king", isReferent: false }),
  PersonaCharacter: () => <span data-testid="persona" />,
}));

let chats: { messageCount: number }[] = [];
let contributionTotal = 0;
let resolved = true;
vi.mock("@/lib/trpc/react", () => ({
  api: {
    ai: { getChatSessions: { useQuery: () => ({ data: chats, isSuccess: resolved }) } },
    cohort: {
      myContributionStats: {
        useQuery: () => ({ data: { total: contributionTotal }, isSuccess: resolved }),
      },
    },
  },
}));

import { NextMovesCard, type NextMovesCardProps } from "@/components/dashboard/next-moves-card";

const fresh: NextMovesCardProps = {
  courseCount: 0,
  gradedCount: 0,
  hasFocusArea: false,
  studyTaskCount: 0,
  calendarConnected: false,
  daysToBidding: null,
  daysToNearestExam: null,
};

const finished: NextMovesCardProps = {
  courseCount: 10,
  gradedCount: 6,
  hasFocusArea: true,
  studyTaskCount: 4,
  calendarConnected: true,
  daysToBidding: null,
  daysToNearestExam: null,
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  chats = [];
  contributionTotal = 0;
  resolved = true;
});

const text = (c: HTMLElement) => c.textContent ?? "";

describe("NextMovesCard — the one list on the home screen", () => {
  it("the counter and the rows are the same set", () => {
    // The bug it replaces: the old card summed over 8 entries, rendered 5, and
    // printed "1/3". Count the rendered rows and the printed count together.
    const { container } = render(<NextMovesCard {...fresh} courseCount={4} gradedCount={2} />);
    const rows = container.querySelectorAll("li");
    expect(rows.length).toBe(7);
    expect(text(container)).toContain("2/7");
  });

  it("renders nothing at all once every move is done", () => {
    chats = [{ messageCount: 3 }];
    contributionTotal = 1;
    const { container } = render(<NextMovesCard {...finished} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays quiet once dismissed, and after a remount", () => {
    const { container } = render(<NextMovesCard {...fresh} />);
    fireEvent.click(screen.getByLabelText("סגירה"));
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const again = render(<NextMovesCard {...fresh} />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it("claims nothing while a trace is still in flight", () => {
    // A row saying "you have not done this" because a request had not returned
    // is exactly the untrustworthiness this replacement exists to remove.
    resolved = false;
    const { container } = render(<NextMovesCard {...fresh} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ticks the advisor from real messages, not from a visit", () => {
    const before = render(<NextMovesCard {...fresh} />);
    expect(text(before.container)).toContain("דברו עם המלך הפילוסוף");
    cleanup();
    chats = [{ messageCount: 2 }];
    const after = render(<NextMovesCard {...fresh} />);
    expect(text(after.container)).toContain("כבר דיברתם עם המלך הפילוסוף");
  });

  it("leads with the plan, dated, when the round is days away", () => {
    const { container } = render(<NextMovesCard {...fresh} daysToBidding={5} />);
    const first = container.querySelectorAll("li")[0]!;
    expect(first.textContent).toContain("בנו את התוכנית");
    expect(first.textContent).toContain("בעוד");
    expect(first.textContent).toContain("5");
  });

  it("prints no day-count when no round or exam is near", () => {
    const { container } = render(<NextMovesCard {...fresh} daysToBidding={90} />);
    expect(text(container)).not.toContain("בעוד");
  });
});
