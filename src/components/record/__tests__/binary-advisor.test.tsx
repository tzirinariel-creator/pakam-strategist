// @vitest-environment jsdom
// =========================================================================
// Locks the miluim binary-conversion advisor's two hardest guards (#11 / #27 —
// the highest-value behavior in this component):
//
//   GATING — the advisor is honest silence unless there is a REAL, safe move:
//     • no binary benefit for the group (A / NONE)          → nothing
//     • the quota (courses) / credit cap (G) is exhausted   → nothing
//     • no ranked candidate would actually RAISE the average → nothing
//     • for a credit-cap group (G) only courses whose ש״ס FIT the remaining
//       credits are offered (a bigger-delta course that doesn't fit is dropped)
//
//   IRREVERSIBLE-ACTION guard (the load-bearing safety property): Convert is a
//   TWO-STEP confirm. The first click only ARMS confirmId — NO mutation. The
//   plan.updateCourse mutation fires ONLY on the SECOND click for the SAME
//   course; switching to a different course re-ARMS instead of converting.
//
// The domain math (lib/binary-advisor, lib/miluim) runs FOR REAL so the test
// drives the component exactly as production does — only the data sources
// (tRPC), i18n, sonner, the personal-address hook and AskKingButton are mocked.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

// Hoisted mutable state shared with the module mocks. `mutate` is the captured
// mutation fn we assert the irreversible-action guard against.
const h = vi.hoisted(() => ({
  courses: [] as unknown[],
  profile: undefined as unknown,
  semesters: [] as unknown[],
  mutate: vi.fn(),
}));

vi.mock("next-intl", () => ({ useLocale: () => "he" }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The advisor also renders a personalized gendered prompt via usePersonalAddress
// (`g`). Only `g` is consumed here; return the neutral form.
vi.mock("@/components/personal/use-personal-address", () => ({
  usePersonalAddress: () => ({
    firstName: null,
    greetName: null,
    gender: "unknown",
    g: (_m: string, _f: string, n: string) => n,
  }),
}));

// AskKingButton is an unrelated CTA (its own tests) — stub to render nothing so
// its copy (which echoes the top candidate's name) can't leak into assertions.
vi.mock("@/components/ui/ask-king-button", () => ({ AskKingButton: () => null }));

vi.mock("@/lib/trpc/react", () => ({
  api: {
    plan: {
      getUserPlan: { useQuery: () => ({ data: { courses: h.courses } }) },
      updateCourse: { useMutation: () => ({ mutate: h.mutate, isPending: false }) },
    },
    user: {
      getProfile: { useQuery: () => ({ data: h.profile }) },
      listMiluimSemesters: { useQuery: () => ({ data: h.semesters }) },
    },
    useUtils: () => ({}),
  },
}));

import { BinaryAdvisor } from "@/components/record/binary-advisor";

// -------------------------------------------------------------------
// Minimal course fixture — only the fields the advisor actually reads:
// id / status / grade / isBinary + course.{ nameHe, code, credits, courseType }.
// -------------------------------------------------------------------
type PlanCourse = {
  id: string;
  courseId: string;
  attemptNumber: number;
  status: string;
  grade: number | null;
  isBinary: boolean;
  course: { nameHe: string; code: string; credits: number; courseType: string };
};

function course(o: {
  id: string;
  nameHe: string;
  grade: number;
  credits: number;
  isBinary?: boolean;
  courseType?: string;
  status?: string;
}): PlanCourse {
  return {
    id: o.id,
    // canonicalAttempts (now applied in the advisor) groups by courseId — each
    // fixture course needs a DISTINCT courseId + attemptNumber or they collapse.
    courseId: o.id,
    attemptNumber: 1,
    status: o.status ?? "COMPLETED",
    grade: o.grade,
    isBinary: o.isBinary ?? false,
    course: {
      nameHe: o.nameHe,
      code: o.id,
      credits: o.credits,
      courseType: o.courseType ?? "ELECTIVE",
    },
  };
}

// A course set with exactly one raising candidate ("מועמד", grade 60), pulled
// up by a high anchor ("עוגן", grade 95). Removing the anchor would LOWER the
// average (delta < 0) → the anchor is never offered.
function oneCandidateSet(): PlanCourse[] {
  return [
    course({ id: "anchor", nameHe: "עוגן", grade: 95, credits: 10 }),
    course({ id: "low", nameHe: "מועמד", grade: 60, credits: 4 }),
  ];
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.courses = [];
  h.profile = undefined;
  h.semesters = [];
  h.mutate.mockClear();
});

describe("BinaryAdvisor — gating (#11/#27)", () => {
  it("renders nothing until the profile has loaded", () => {
    h.profile = undefined;
    h.courses = oneCandidateSet();
    const { container } = render(<BinaryAdvisor />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a group with NO binary benefit (GROUP_A)", () => {
    // Real, raising candidate data present — so an empty render proves it's the
    // benefit GATE (binaryBenefitOf), not missing data.
    h.profile = { miluimGroup: "GROUP_A", miluimBinaryUsed: 0 };
    h.courses = oneCandidateSet();
    const { container } = render(<BinaryAdvisor />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for NONE (no miluim benefit at all)", () => {
    h.profile = { miluimGroup: "NONE", miluimBinaryUsed: 0 };
    h.courses = oneCandidateSet();
    const { container } = render(<BinaryAdvisor />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the course quota is exhausted (GROUP_B, 5 used)", () => {
    // BA course cap is 5; 5 already used → quotaLeft 0 → advisor stays silent
    // even though a raising candidate exists.
    h.profile = { miluimGroup: "GROUP_B", miluimBinaryUsed: 5 };
    h.courses = oneCandidateSet();
    const { container } = render(<BinaryAdvisor />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the credit cap is exhausted (GROUP_G, 6 ש״ס used)", () => {
    // G is credit-denominated (cap 6). Each external conversion counts as the
    // 2-ש״ס minimum, so 3 used → 6 credits used → creditsLeft 0 → silent.
    h.profile = { miluimGroup: "GROUP_G", miluimBinaryUsed: 3 };
    h.courses = oneCandidateSet();
    const { container } = render(<BinaryAdvisor />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when NO candidate would raise the average", () => {
    // Two equal grades (85 / 85): removing either leaves the average at 85
    // (delta 0), so rankBinaryCandidates yields no raising candidate → silent.
    h.profile = { miluimGroup: "GROUP_B", miluimBinaryUsed: 0 };
    h.courses = [
      course({ id: "a", nameHe: "קורס-א", grade: 85, credits: 4 }),
      course({ id: "b", nameHe: "קורס-ב", grade: 85, credits: 4 }),
    ];
    const { container } = render(<BinaryAdvisor />);
    expect(container).toBeEmptyDOMElement();
  });

  it("credit-cap group (G): offers only courses whose ש״ס FIT the remaining credits", () => {
    // creditsLeft = 6. Two raising candidates:
    //   "קטן" grade 70, 4 ש״ס  → delta ~+2.0, FITS 6
    //   "גדול" grade 70, 8 ש״ס  → delta ~+5.2 (BIGGER), does NOT fit 6
    // Without the credit-fit filter the bigger-delta "גדול" would rank first and
    // appear; the filter must drop it and offer only "קטן".
    h.profile = { miluimGroup: "GROUP_G", miluimBinaryUsed: 0 };
    h.courses = [
      course({ id: "anchor", nameHe: "עוגן", grade: 90, credits: 10 }),
      course({ id: "small", nameHe: "קטן", grade: 70, credits: 4 }),
      course({ id: "big", nameHe: "גדול", grade: 70, credits: 8 }),
    ];
    render(<BinaryAdvisor />);

    // Credit-cap copy branch is active.
    expect(screen.getByText(/עד 6 ש״ס/)).toBeInTheDocument();
    // Only the fitting course is offered.
    expect(screen.getByText("קטן")).toBeInTheDocument();
    expect(screen.queryByText("גדול")).not.toBeInTheDocument();
    // The average-raising anchor is never a candidate (removing it lowers the avg).
    expect(screen.queryByText("עוגן")).not.toBeInTheDocument();
  });
});

describe("BinaryAdvisor — IRREVERSIBLE-ACTION guard (#11/#27)", () => {
  it("Convert is a TWO-STEP confirm: first click ARMS (no mutation), second click on the SAME course converts once", () => {
    h.profile = { miluimGroup: "GROUP_B", miluimBinaryUsed: 0 };
    h.courses = oneCandidateSet();
    render(<BinaryAdvisor />);

    // One raising candidate → one convert control, labeled "המר לבינארי".
    const first = screen.getByRole("button", { name: /המר לבינארי/ });
    fireEvent.click(first);

    // FIRST click only ARMS confirmId — the mutation MUST NOT fire yet.
    expect(h.mutate).not.toHaveBeenCalled();

    // The control now shows the irreversible-action confirmation copy.
    const armed = screen.getByRole("button", { name: /בלתי-הפיכה — להמשיך/ });
    fireEvent.click(armed);

    // SECOND click on the SAME course fires the mutation EXACTLY once, with the
    // convert payload.
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0]![0]).toEqual({ userCourseId: "low", isBinary: true });
  });

  it("arming one course then clicking a DIFFERENT course re-ARMS instead of converting", () => {
    // Two raising candidates so we can switch between them mid-confirm.
    h.profile = { miluimGroup: "GROUP_B", miluimBinaryUsed: 0 };
    h.courses = [
      course({ id: "anchor", nameHe: "עוגן", grade: 95, credits: 10 }),
      course({ id: "x", nameHe: "קורס-איקס", grade: 60, credits: 4 }),
      course({ id: "y", nameHe: "קורס-וואי", grade: 65, credits: 4 }),
    ];
    render(<BinaryAdvisor />);

    const btnIn = (name: string) =>
      within(screen.getByText(name).closest("li") as HTMLElement).getByRole("button");

    // Arm X.
    fireEvent.click(btnIn("קורס-איקס"));
    expect(h.mutate).not.toHaveBeenCalled();

    // Click a DIFFERENT course (Y): confirmId !== Y → this only re-arms, it must
    // NOT be treated as the second confirm for X.
    fireEvent.click(btnIn("קורס-וואי"));
    expect(h.mutate).not.toHaveBeenCalled();

    // Now Y is armed — a second click on Y converts Y exactly once.
    fireEvent.click(btnIn("קורס-וואי"));
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0]![0]).toEqual({ userCourseId: "y", isBinary: true });
  });
});
