/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BiddingProximityNudge } from "../bidding-proximity-nudge";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// Without this each render stacks in the same document and a "find the one
// link" assertion sees several.
afterEach(cleanup);

describe("BiddingProximityNudge", () => {
  it("counts down to a round that has not opened yet", () => {
    // Round 1 of תשפ״ז opens 7.9.2026.
    render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    expect(screen.getByText(/הבידינג נפתח בעוד/)).toBeTruthy();
  });

  it("points at the screen that answers the countdown it just printed", () => {
    // This asserted `/planner`, and that was the defect (#17). Ariel clicked
    // this very headline and landed on /planner's zero-course branch — the
    // onboarding welcome copy and a single "לדף הבית" button: "וגם תכלס זה לא
    // באמת עובד ואין איזה מסך ייעודי וזה גרוע".
    //
    // A green test held it there, because it asserted the DESTINATION rather
    // than the promise. A card headlined "הבידינג נפתח בעוד N ימים" owes the
    // student the screen about the round — the dates and both semesters — not
    // a planner that may greet them as though they had never signed up.
    render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/bidding");
  });

  it("says nothing once bidding is over", () => {
    // A student planning in March does not need a countdown to September, and
    // a stale countdown is worse than no countdown.
    const { container } = render(<BiddingProximityNudge now={new Date("2027-03-01T09:00:00+03:00")} />);
    expect(container.textContent).toBe("");
  });

  it("never mentions points", () => {
    // TAU does not publish the quota and this app never guesses one. Guarding
    // the copy directly, because this is the one place it would be tempting.
    const { container } = render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    expect(container.textContent).not.toMatch(/נקוד|points/);
  });
});
