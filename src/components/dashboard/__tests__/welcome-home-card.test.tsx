/** @vitest-environment jsdom */
// Closing a verification gap I could not close in a browser: this card only
// renders for a brand-new account, and the demo account has a full plan. So it
// is exercised here instead — rendering the real component and asserting what
// a student would actually see on screen.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WelcomeHomeCard } from "../welcome-home-card";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/personal/use-personal-address", () => ({
  // Mirrors the real helper for the case that matters here: a new account has
  // no declared gender, so pg() returns the NEUTRAL third form. A mock that
  // returned the masculine one would be testing a screen no new user sees.
  usePersonalAddress: () => ({
    greetName: "יובל",
    g: (_m: string, _f: string, neutral: string) => neutral,
  }),
}));

afterEach(cleanup);

const t = (k: string) => k;
const EMPTY = { courseCount: 0, gradedCount: 0, hasFocusArea: false, hasRegulationResult: false };

describe("WelcomeHomeCard — what a new student sees", () => {
  it("shows 0/4 and no ticks on a brand-new account", () => {
    render(<WelcomeHomeCard t={t} isHe onDismiss={() => {}} progressInput={EMPTY} />);
    expect(screen.getByText("0/4")).toBeTruthy();
    expect(screen.getByText(/בנו את תוכנית התואר/)).toBeTruthy();
  });

  it("ticks a step the moment it is really done", () => {
    render(
      <WelcomeHomeCard t={t} isHe onDismiss={() => {}} progressInput={{ ...EMPTY, courseCount: 12 }} />,
    );
    expect(screen.getByText("1/4")).toBeTruthy();
    // The done wording replaces the imperative — "תוכנית התואר בנויה".
    expect(screen.getByText(/תוכנית התואר בנויה/)).toBeTruthy();
  });

  it("credits a student who arrived with everything already filled in", () => {
    // Withholding credit for work already done to make a bar look busier is
    // the thing this card was rebuilt to stop doing.
    render(
      <WelcomeHomeCard
        t={t}
        isHe
        onDismiss={() => {}}
        progressInput={{ courseCount: 32, gradedCount: 28, hasFocusArea: true, hasRegulationResult: true }}
      />,
    );
    expect(screen.getByText("4/4")).toBeTruthy();
    expect(screen.getByText(/הכול מוכן/)).toBeTruthy();
  });

  it("reports progress to assistive tech, not only visually", () => {
    render(
      <WelcomeHomeCard t={t} isHe onDismiss={() => {}} progressInput={{ ...EMPTY, courseCount: 1 }} />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
  });

  it("greets by name", () => {
    const { container } = render(
      <WelcomeHomeCard t={t} isHe onDismiss={() => {}} progressInput={EMPTY} />,
    );
    expect(container.textContent).toContain("יובל");
  });
});
