// @vitest-environment jsdom
// =========================================================================
// 13.8 — what the HOME SCREEN actually renders about registration.
// The pure ladder is covered in lib/__tests__/time-focus-bidding.test.ts;
// this pins the surface: with published dates in range home shows the real
// timeline (round numbers, opening and closing to the hour), off-season it
// shows nothing at all, and in no phase does it print a points prediction.
// =========================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

let profile: { startYear: number | null; currentYear: number } | undefined = {
  startYear: 2026,
  currentYear: 1,
};
vi.mock("@/lib/trpc/react", () => ({
  api: { user: { getProfile: { useQuery: () => ({ data: profile }) } } },
}));

import { BiddingSeasonCard } from "@/components/dashboard/bidding-season-card";

const il = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h - 3));

beforeEach(() => {
  cleanup();
  profile = { startYear: 2026, currentYear: 1 };
});

// <Bidi> wraps every number in its own <bdi>, so the rendered title is split
// across elements — assert on the flattened text of the whole card.
const text = (c: HTMLElement) => c.textContent ?? "";

describe("BiddingSeasonCard — home screen registration surface", () => {
  it("shows the real timeline in the run-up, with the official round dates", () => {
    const { container } = render(<BiddingSeasonCard now={il(2026, 8, 13)} />);
    expect(text(container)).toMatch(/מקצה\s*1\s*נפתח בעוד\s*25\s*ימים/);
    // The published round-1 window, quoted from the faculty guidelines.
    expect(text(container)).toMatch(/7\.9\s*11:00 — 15\.9\s*10:00/);
    expect(text(container)).toMatch(/23\.9\s*11:00 — 5\.10\s*10:00/);
  });

  it("keeps showing the timeline even when the hero already owns the ask — it carries the dates the hero can't", () => {
    const { container } = render(<BiddingSeasonCard heroOwnsBidding now={il(2026, 8, 13)} />);
    expect(text(container)).toMatch(/מקצה\s*1\s*נפתח/);
  });

  it("says the round is OPEN once it opens", () => {
    const { container } = render(<BiddingSeasonCard now={il(2026, 9, 10)} />);
    expect(text(container)).toMatch(/מקצה\s*1\s*פתוח/);
  });

  it("renders nothing off-season rather than counting down from July", () => {
    const { container } = render(<BiddingSeasonCard now={il(2026, 7, 1)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once the rounds are done, even though teaching is 8 days away", () => {
    const { container } = render(<BiddingSeasonCard now={il(2026, 10, 10)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a student with no semester left to register for", () => {
    // Started תשפ״ד → year 3 in תשפ״ו; the coming FALL would be a year 4.
    profile = { startYear: 2023, currentYear: 3 };
    const { container } = render(<BiddingSeasonCard now={il(2026, 8, 13)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never predicts points — it says outright that it doesn't", () => {
    const { container } = render(<BiddingSeasonCard now={il(2026, 8, 13)} />);
    expect(text(container)).toMatch(/לא מנחש כמה נקודות צריך/);
    expect(text(container)).not.toMatch(/סיכוי|צפי נקודות|יעלה לכם/);
  });
});
