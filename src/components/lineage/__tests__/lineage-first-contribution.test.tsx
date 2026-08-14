// @vitest-environment jsdom
// =========================================================================
// #31 — the lineage's "start here" action must BE the action.
// =========================================================================
// The regression this pins: the page said "דרגו קורס אחד שכבר סיימתם" and
// linked to /record, which has no rating control on it. So the assertions here
// are about the promise being keepable — a completed, unrated course is
// offered with a control that opens the real review sheet for THAT course —
// and about the three states that used to be conflated: nothing finished yet,
// everything already rated, and a failed fetch (which must never be dressed up
// as "you have no completed courses").

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// The sheet is exercised by its own surface; here it only has to prove that the
// button wires the RIGHT course into it.
vi.mock("@/components/catalog/contribute-review-sheet", () => ({
  ContributeReviewSheet: ({ courseCode, courseName }: { courseCode: string; courseName: string }) => (
    <div data-testid="review-sheet">{`${courseCode}|${courseName}`}</div>
  ),
}));

type QueryState = {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  refetch?: () => void;
};
let queryState: QueryState = { isLoading: true };
const invalidate = vi.fn();

vi.mock("@/lib/trpc/react", () => ({
  api: {
    useUtils: () => ({
      courseKnowledge: { myReviewableCourses: { invalidate } },
    }),
    courseKnowledge: {
      myReviewableCourses: {
        useQuery: () => ({ refetch: vi.fn(), ...queryState }),
      },
    },
  },
}));

import { LineageFirstContribution } from "@/components/lineage/lineage-first-contribution";

const MICRO = { courseCode: "1011-2103", nameHe: "מיקרו א׳", nameEn: "Micro I", reviewed: false };
const STATS = { courseCode: "0651-1005", nameHe: "סטטיסטיקה", nameEn: null, reviewed: true };

beforeEach(() => {
  cleanup();
  invalidate.mockClear();
  queryState = { isLoading: true };
});

describe("LineageFirstContribution", () => {
  it("stays silent while loading — no empty state before the data lands", () => {
    const { container } = render(<LineageFirstContribution />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers every completed course that isn't rated yet", () => {
    queryState = {
      data: { courses: [MICRO, STATS], completedCount: 2, reviewedCount: 1 },
    };
    render(<LineageFirstContribution />);
    expect(screen.getByText("מיקרו א׳")).toBeInTheDocument();
    // Already rated → not offered again.
    expect(screen.queryByText("סטטיסטיקה")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /לדירוג/ })).toHaveLength(1);
  });

  it("opens the review sheet for the course that was clicked", () => {
    queryState = {
      data: { courses: [MICRO], completedCount: 1, reviewedCount: 0 },
    };
    render(<LineageFirstContribution />);
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /לדירוג/ }));
    expect(screen.getByTestId("review-sheet")).toHaveTextContent("1011-2103|מיקרו א׳");
  });

  it("states the k-anonymity bar as the reason to rate, never as a blocker", () => {
    queryState = {
      data: { courses: [MICRO], completedCount: 1, reviewedCount: 0 },
    };
    const { container } = render(<LineageFirstContribution />);
    // <Bidi> splits the number into its own <bdi>, so match the whole block.
    expect(container.textContent).toMatch(/מ-3 מדרגים/);
  });

  it("sends a student with nothing completed to the grade scanner, not to a dead end", () => {
    queryState = { data: { courses: [], completedCount: 0, reviewedCount: 0 } };
    render(<LineageFirstContribution />);
    const link = screen.getByRole("link", { name: /להזנת הציונים שלי/ });
    // ?scan=1 is what opens /record ON the scanner instead of at the top.
    expect(link).toHaveAttribute("href", "/record?scan=1");
  });

  it("closes the loop when everything is already rated", () => {
    queryState = {
      data: {
        courses: [{ ...MICRO, reviewed: true }],
        completedCount: 1,
        reviewedCount: 1,
      },
    };
    render(<LineageFirstContribution />);
    expect(screen.getByText(/דירגתם את כל/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /לדירוג/ })).not.toBeInTheDocument();
  });

  it("never dresses a failed fetch as 'you have no completed courses'", () => {
    queryState = { isError: true };
    render(<LineageFirstContribution />);
    expect(screen.getByText(/לא הצלחנו לטעון/)).toBeInTheDocument();
    expect(screen.queryByText(/ועוד אין כאן קורס מסומן כהושלם/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /נסו שוב/ })).toBeInTheDocument();
  });

  it("folds a long list behind a toggle instead of dumping every course", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      courseCode: `C-${i}`,
      nameHe: `קורס ${i}`,
      nameEn: null,
      reviewed: false,
    }));
    queryState = { data: { courses: many, completedCount: 7, reviewedCount: 0 } };
    render(<LineageFirstContribution />);
    expect(screen.getAllByRole("button", { name: /לדירוג/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /הצגת כל/ }));
    expect(screen.getAllByRole("button", { name: /לדירוג/ })).toHaveLength(7);
  });
});
