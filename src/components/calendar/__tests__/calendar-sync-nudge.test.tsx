// @vitest-environment jsdom
// =========================================================================
// #40 — "the app never once suggested syncing to Google Calendar".
// The offer now exists at the moment a plan is on screen, and it must be a
// nudge, never a nag: one refusal (here OR on the dashboard banner) retires it
// for good, and it never appears when there is nothing to offer.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

let googleData: { connected: boolean; configured: boolean } | undefined = {
  connected: false,
  configured: true,
};
vi.mock("@/lib/trpc/react", () => ({
  api: {
    schedule: { getGoogleStatus: { useQuery: () => ({ data: googleData }) } },
  },
}));

import { CalendarSyncNudge } from "@/components/calendar/calendar-sync-nudge";

const offer = () => screen.queryByText(/שנעביר את זה ליומן שלכם\?/);

beforeEach(() => {
  cleanup();
  localStorage.clear();
  googleData = { connected: false, configured: true };
});

describe("CalendarSyncNudge (#40)", () => {
  it("offers the sync once a plan exists and the account isn't connected", () => {
    render(<CalendarSyncNudge show />);
    expect(offer()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /לחיבור היומן/ })).toHaveAttribute("href", "/settings");
  });

  it("stays silent when there is nothing to sync yet", () => {
    render(<CalendarSyncNudge show={false} />);
    expect(offer()).not.toBeInTheDocument();
  });

  it("stays silent once the account is connected", () => {
    googleData = { connected: true, configured: true };
    render(<CalendarSyncNudge show />);
    expect(offer()).not.toBeInTheDocument();
  });

  it("stays silent when Google isn't configured on the server — no dead-end link", () => {
    googleData = { connected: false, configured: false };
    render(<CalendarSyncNudge show />);
    expect(offer()).not.toBeInTheDocument();
  });

  it("'לא, תודה' retires it for good", () => {
    const { unmount } = render(<CalendarSyncNudge show />);
    fireEvent.click(screen.getByText("לא, תודה"));
    expect(offer()).not.toBeInTheDocument();
    unmount();
    render(<CalendarSyncNudge show />);
    expect(offer()).not.toBeInTheDocument();
  });

  it("a refusal on the dashboard's own Google banner also silences this one", () => {
    localStorage.setItem("pakamon-google-banner-dismissed", "true");
    render(<CalendarSyncNudge show />);
    expect(offer()).not.toBeInTheDocument();
  });
});
