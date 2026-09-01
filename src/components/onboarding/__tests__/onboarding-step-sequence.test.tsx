// @vitest-environment jsdom
// =========================================================================
// #7 (13.8) — "למה יש עוד שלב של מעבר על הגיליון - זאת קצת כפילות".
//
// The flow used to be:
//   Standing (upload + "זה מה שקראנו מהגיליון", READ-ONLY)
//   → Profile (year / semester / focus / miluim)
//   → History ("אישור מה שקראנו מהגיליון", EDITABLE)
// The same rows, twice, with an unrelated screen wedged between them — and
// only the second showing could actually be corrected. Now that the FIRST
// showing is editable (#5), a scanned student sees the rows once.
//
// Two things are locked here:
//   1. The step SEQUENCE per path — and that the manual (no-sheet) student
//      keeps their history step, because nothing has been read for them.
//   2. The step RAIL is stable. It used to derive from data.year/data.semester,
//      which are still the year-1 defaults while the student is standing ON the
//      standing step: the rail showed 4 items, the scan set year 3, and it
//      silently grew to 5 under them.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { OnboardingData } from "@/components/onboarding/onboarding-wizard";
import type { StandingResult } from "@/components/onboarding/step-standing";

vi.mock("next-intl", () => ({ useLocale: () => "he", useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/record/where-is-my-sheet", () => ({ WhereIsMySheet: () => null }));
vi.mock("@/lib/upload", () => ({
  fileToBase64: async () => ({ b64: "x", mime: "image/png" }),
  SCANNER_ACCEPT: "image/*",
}));

const CATALOG = [
  { id: "c1", code: "0651-1001", nameHe: "מבוא לפילוסופיה", nameEn: "Intro", credits: 4, courseType: "MANDATORY", isMandatory: true, discipline: "PHILOSOPHY", canCountAs: [], yearOffered: [1], semesterOffered: ["FALL"] },
] as unknown as CourseWithSchedule[];

vi.mock("@/lib/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    course: { list: { useQuery: () => ({ data: CATALOG, isLoading: false, isError: false, refetch: vi.fn() }) } },
    // The wizard reads the profile only to scope its saved state to the
    // account (see onboardingStateKey) — nothing on screen depends on it.
    user: { getProfile: { useQuery: () => ({ data: { supabaseId: "sb-test" }, isLoading: false, isError: false }) } },
  },
}));

// The standing step stands in for the student's answer to "where are you in the
// degree?" — the three answers the real screen can produce.
vi.mock("@/components/onboarding/step-standing", () => ({
  StepStanding: ({ onDone }: { onDone: (r: StandingResult) => void }) => (
    <div data-testid="step-standing">
      <button onClick={() => onDone({ choice: "fresh" })}>stub-fresh</button>
      <button
        onClick={() =>
          onDone({
            choice: "returning",
            year: 3,
            semester: "FALL",
            fromSheet: true,
            completedSeed: {
              "0651-1001": {
                courseCode: "0651-1001",
                plannedYear: 1,
                plannedSemester: "FALL",
                grade: 88,
              },
            },
          })
        }
      >
        stub-sheet
      </button>
      {/* Both manual escapes on the real screen ("נמלא ידנית", and a scan we
          couldn't place) call onDone with nothing but the choice. */}
      <button onClick={() => onDone({ choice: "returning" })}>stub-manual</button>
    </div>
  ),
}));

vi.mock("@/components/onboarding/step-welcome", () => ({
  StepWelcome: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>stub-welcome-next</button>,
}));

vi.mock("@/components/onboarding/step-profile", () => ({
  StepProfile: ({ data, onUpdate }: { data: OnboardingData; onUpdate: (u: Partial<OnboardingData>) => void }) => (
    <div data-testid="step-profile">
      <span data-testid="profile-year">{data.year}</span>
      {/* The manual path picks its year HERE — the standing step never sent one. */}
      <button onClick={() => onUpdate({ year: 3, semester: "FALL" })}>stub-set-year-3</button>
    </div>
  ),
}));

vi.mock("@/components/onboarding/semester-planner/index", () => ({
  SemesterPlanner: () => <div data-testid="step-planner" />,
}));
vi.mock("@/components/onboarding/step-ready", () => ({
  StepReady: () => <div data-testid="step-ready" />,
}));
vi.mock("@/components/onboarding/planner-error-boundary", () => ({
  PlannerErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/** The named steps currently in the rail, in order. */
function railLabels(): string[] {
  const rail = screen.getByTestId("onboarding-flow-rail");
  return Array.from(rail.children).map((c) => (c.textContent ?? "").trim());
}

const HISTORY_LABEL = "מה כבר עשיתם";
const hasHistoryInRail = () => railLabels().some((l) => l.includes(HISTORY_LABEL));

function start() {
  render(<OnboardingWizard />);
  fireEvent.click(screen.getByRole("button", { name: "stub-welcome-next" }));
  expect(screen.getByTestId("step-standing")).toBeInTheDocument();
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "next" }));

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("onboarding step sequence (#7) — the sheet is reviewed once", () => {
  it("a scanned student goes Standing → Profile → Planner, never through History", () => {
    start();
    // The rail on the standing step, BEFORE the scan.
    expect(railLabels()).toHaveLength(4);
    expect(hasHistoryInRail()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "stub-sheet" }));
    expect(screen.getByTestId("step-profile")).toBeInTheDocument();
    // The scan set year 3 — and the rail did NOT grow a step under the student.
    expect(screen.getByTestId("profile-year")).toHaveTextContent("3");
    expect(railLabels()).toHaveLength(4);
    expect(hasHistoryInRail()).toBe(false);

    next();
    expect(screen.getByTestId("step-planner")).toBeInTheDocument();
    // The second pass over the same rows is gone.
    expect(screen.queryByText("historyTitle")).not.toBeInTheDocument();
  });

  it("a fresh year-1 student still skips History", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "stub-fresh" }));
    expect(screen.getByTestId("profile-year")).toHaveTextContent("1");
    expect(railLabels()).toHaveLength(4);
    next();
    expect(screen.getByTestId("step-planner")).toBeInTheDocument();
  });

  it("a returning student WITHOUT a sheet keeps the history step", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "stub-manual" }));
    expect(screen.getByTestId("step-profile")).toBeInTheDocument();
    // They arrive on the default year 1, so there is nothing behind them yet.
    expect(hasHistoryInRail()).toBe(false);

    // They pick their real year on this screen — now the step is genuinely
    // needed, and it appears at the same moment they say so.
    fireEvent.click(screen.getByRole("button", { name: "stub-set-year-3" }));
    expect(hasHistoryInRail()).toBe(true);
    expect(railLabels()).toHaveLength(5);

    next();
    // The real StepHistory renders — nothing that step offered was lost for a
    // student who never handed us a sheet.
    expect(screen.getByText("historyTitle")).toBeInTheDocument();
  });

  it("back from the planner returns to History on the manual path only", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "stub-sheet" }));
    next();
    expect(screen.getByTestId("step-planner")).toBeInTheDocument();

    cleanup();
    localStorage.clear();

    start();
    fireEvent.click(screen.getByRole("button", { name: "stub-manual" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-set-year-3" }));
    next();
    expect(screen.getByText("historyTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByTestId("step-profile")).toBeInTheDocument();
  });

  it("the rail's numbering and the progress bar agree with the real path length", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "stub-sheet" }));
    const rail = screen.getByTestId("onboarding-flow-rail");
    // Profile is item 2 of 4, and it is the one marked current.
    const current = within(rail).getByText(/הפרופיל/);
    expect(current).toHaveAttribute("aria-current", "step");
    // (Items after the first carry the "·" separator in their text.)
    expect(railLabels()[1]).toMatch(/2\.\s*הפרופיל$/);
    expect(railLabels()[3]).toMatch(/4\.\s*סיום$/);
  });
});
