// @vitest-environment jsdom
// =========================================================================
// A SURFACE follows the chosen advisor — end to end, not just in the helper.
//
// The dashboard milestone card is the exact screen Ariel caught: it announced
// "רגע של המלך" with the King's crown and a line about Plato's cave to a
// student whose chosen advisor was הרפרנט. This test renders the real card
// against the real store and asserts that the header, the emblem AND the words
// all move together — and that a switch takes effect without a reload.
// =========================================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

import { MilestoneMoment } from "@/components/dashboard/milestone-moment";
import { setPersona, __resetPersonaCache } from "@/components/persona/use-persona";
import { PERSONA_KEY } from "@/lib/persona";

// A student half-way through the degree — the 50% milestone is the one shown.
const halfway = {
  isHe: true,
  earnedCredits: 75,
  totalCredits: 150,
  gradedCount: 12,
  englishExempt: false,
  gender: "male" as const,
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.removeItem("pk-milestones-seen"); // nothing acknowledged yet
  __resetPersonaCache();
});

afterEach(() => cleanup());

describe("the milestone card speaks as the advisor the student chose", () => {
  it("no choice stored → the King: his header, his crown, his canon", () => {
    render(<MilestoneMoment {...halfway} />);
    expect(screen.getByText("רגע של המלך")).toBeInTheDocument();
    expect(screen.getByText(/עברתם את חצי התואר/)).toBeInTheDocument();
    // The King's line is the one that reads like the King.
    expect(screen.getByText(/מנקודת האמצע/)).toBeInTheDocument();
  });

  it("pk-persona=referent → the Referent's header AND his own words, never the King's", () => {
    localStorage.setItem(PERSONA_KEY, "referent");
    __resetPersonaCache();
    render(<MilestoneMoment {...halfway} />);

    expect(screen.getByText("רגע של הרפרנט")).toBeInTheDocument();
    expect(screen.queryByText("רגע של המלך")).not.toBeInTheDocument();
    // Same fact (the number), different voice.
    expect(screen.getByText(/עברתם את חצי התואר/)).toBeInTheDocument();
    expect(screen.getByText(/לתכנן אחורה מהסוף/)).toBeInTheDocument();
    expect(screen.queryByText(/מנקודת האמצע/)).not.toBeInTheDocument();
  });

  it("the emblem swaps too — the crown is never shown to a Referent user", () => {
    const asKing = render(<MilestoneMoment {...halfway} />);
    // The crown's "orb of the Good" carries a class hook the badge never has.
    const kingMark = asKing.container.querySelector("svg");
    expect(kingMark?.innerHTML).toContain("pk-king-orb");

    cleanup();
    localStorage.setItem(PERSONA_KEY, "referent");
    __resetPersonaCache();
    const asReferent = render(<MilestoneMoment {...halfway} />);
    const referentMark = asReferent.container.querySelector("svg");
    expect(referentMark?.innerHTML).not.toContain("pk-king-orb");
  });

  it("switching re-brands a MOUNTED card — no reload, no remount", () => {
    render(<MilestoneMoment {...halfway} />);
    expect(screen.getByText("רגע של המלך")).toBeInTheDocument();

    act(() => setPersona("referent"));

    expect(screen.getByText("רגע של הרפרנט")).toBeInTheDocument();
    expect(screen.queryByText("רגע של המלך")).not.toBeInTheDocument();
    // …and the choice was persisted for the next page load.
    expect(localStorage.getItem(PERSONA_KEY)).toBe("referent");
  });
});
