// @vitest-environment jsdom
// =========================================================================
// First component/flow test in the suite (seeds the .test.tsx net the
// code-health audit flagged as missing). Covers CohortShareNudge — the growth
// loop's honest empty-state: it must invite a contribution when the student
// hasn't shared, stay out of the way once they have (per-device flag), and
// carry the k-anon honesty fine-print (no fake data, average only at 5+).
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mutate = vi.fn();
vi.mock("@/lib/trpc/react", () => ({
  api: {
    courseKnowledge: {
      importMyGrades: { useMutation: () => ({ mutate, isPending: false }) },
    },
  },
}));

import { CohortShareNudge } from "@/components/cohort/cohort-share-nudge";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  mutate.mockClear();
});

describe("CohortShareNudge", () => {
  it("card: invites a contribution with the honest k-anon fine-print when not yet shared", () => {
    render(<CohortShareNudge variant="card" />);
    expect(screen.getByText("תיק המחזור מתמלא")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /שתפו את הקורסים שסיימתי/ }),
    ).toBeInTheDocument();
    // The honesty contract must be visible: anonymised, reveal only at 5+.
    expect(screen.getByText(/ממוצע נחשף רק מ-5 תורמים ומעלה/)).toBeInTheDocument();
  });

  it("card: steps out of the way once the student has already contributed", () => {
    localStorage.setItem("pk-cohort-shared", "1");
    const { container } = render(<CohortShareNudge variant="card" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("card: is dismissible and stays dismissed (per-device)", () => {
    localStorage.setItem("pk-cohort-nudge-dismissed", "1");
    const { container } = render(<CohortShareNudge variant="card" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("inline: shows a compact share strip inside a transient surface", () => {
    render(<CohortShareNudge variant="inline" />);
    expect(screen.getByRole("button", { name: /שתפו למחזור/ })).toBeInTheDocument();
  });

  it("share button triggers the anonymous import mutation", () => {
    render(<CohortShareNudge variant="card" />);
    screen.getByRole("button", { name: /שתפו את הקורסים שסיימתי/ }).click();
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
