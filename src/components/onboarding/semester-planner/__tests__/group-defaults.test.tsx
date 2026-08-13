// @vitest-environment jsdom
// =========================================================================
// F2 + F3 — the student must be able to tell THEIR decision from OUR guess.
//
// Ariel, on the planner: "כסטודנט היה לי קצת קשה לבחור קבוצה וזה קצת בילבל
// אותי ולא היה לי אינטואיטיבי להבין איך אני בדיוק בוחר."
//
// Two things caused it and both are locked here:
//   • The grid printed "תרגול · קבוצה 03" as settled fact when nobody had
//     chosen anything — the app's alphabetical fallback wearing the clothes of
//     a decision. Nowhere in the planner was there a "you haven't chosen yet"
//     state, though /calendar had exactly that sentence.
//   • The summary's "בחרו את שלכם" nudge counted CATALOG multi-group courses,
//     so it could never be satisfied: pick every group and it still nags.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

import { LiveTimetable } from "@/components/onboarding/semester-planner/live-timetable";
import { SemesterSummary } from "@/components/onboarding/semester-planner/semester-summary";
import { GroupRail } from "@/components/onboarding/semester-planner/group-rail";
import type { CourseWithSchedule } from "@/lib/plan-generator";

const CODE = "1011-1111";

const withThreeTutorialGroups = [
  {
    id: "c1",
    code: CODE,
    nameHe: "מבוא לכלכלה",
    nameEn: "Intro to Economics",
    credits: 4,
    discipline: "ECONOMICS",
    courseType: "MANDATORY",
    isMandatory: true,
    difficultyLevel: null,
    examDateA: null,
    scheduleSessions: [
      { dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00", sessionType: "lecture", groupCode: "01", semester: "FALL" },
      { dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00", sessionType: "tutorial", groupCode: "01", semester: "FALL" },
      { dayOfWeek: "MONDAY", startTime: "12:00", endTime: "14:00", sessionType: "tutorial", groupCode: "02", semester: "FALL" },
      { dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00", sessionType: "tutorial", groupCode: "03", semester: "FALL" },
    ],
  },
] as unknown as CourseWithSchedule[];

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("F3 — a default never looks like a decision", () => {
  it("says so above the grid, and marks the block, when nothing was chosen", () => {
    render(
      <LiveTimetable
        courses={withThreeTutorialGroups}
        currentSemester="FALL"
        sessionGroupSelections={{}}
        interactive
        multiGroupCourseCodes={new Set([CODE])}
        onSelectSessionGroup={() => {}}
      />,
    );
    // The honest line — the count comes from the student's own picks.
    expect(screen.getByText(/קבוצה אחת עדיין בברירת מחדל/)).toBeInTheDocument();
    // …and the block itself is labelled rather than asserting "קבוצה 01".
    expect(screen.getAllByText(/ברירת מחדל/).length).toBeGreaterThan(1);
  });

  it("goes quiet the moment the group IS chosen — including the block label", () => {
    render(
      <LiveTimetable
        courses={withThreeTutorialGroups}
        currentSemester="FALL"
        sessionGroupSelections={{ [CODE]: { tutorial: "02" } }}
        interactive
        multiGroupCourseCodes={new Set([CODE])}
        onSelectSessionGroup={() => {}}
      />,
    );
    expect(screen.queryByText(/בברירת מחדל/)).toBeNull();
    expect(screen.queryByText(/ברירת מחדל/)).toBeNull();
    // The chosen group is the one on the grid (agenda variant renders the line).
    expect(screen.getAllByText(/קבוצה 02/).length).toBeGreaterThan(0);
  });

  it("a course with a single group per type is never called a default", () => {
    const single = [
      {
        ...withThreeTutorialGroups[0],
        scheduleSessions: withThreeTutorialGroups[0]!.scheduleSessions!.slice(0, 2),
      },
    ] as unknown as CourseWithSchedule[];
    render(
      <LiveTimetable courses={single} currentSemester="FALL" sessionGroupSelections={{}} />,
    );
    expect(screen.queryByText(/ברירת מחדל/)).toBeNull();
  });
});

describe("F2 — the summary's nudge can actually be satisfied", () => {
  const summaryProps = {
    year: 1,
    semester: "FALL" as const,
    courses: withThreeTutorialGroups,
    totalCredits: 4,
    hasMoreSemesters: true,
    onPlanNext: () => {},
    onFinish: () => {},
    onBack: () => {},
  };

  it("nudges while a group is still ours", () => {
    render(<SemesterSummary {...summaryProps} unchosenGroupCount={2} />);
    expect(screen.getByText(/קבוצות עדיין בברירת מחדל/)).toBeInTheDocument();
  });

  it("disappears at zero — the state the old catalog-derived count could not reach", () => {
    render(<SemesterSummary {...summaryProps} unchosenGroupCount={0} />);
    expect(screen.queryByText(/ברירת מחדל/)).toBeNull();
  });

  it("stays quiet for a semester that already ended — nothing to choose", () => {
    render(<SemesterSummary {...summaryProps} unchosenGroupCount={2} semesterOver />);
    expect(screen.queryByText(/ברירת מחדל/)).toBeNull();
  });
});

describe("F6 — the rail: choosing where the change is visible", () => {
  const rail = (
    selections: Record<string, Record<string, string>>,
    onPick: (courseCode: string, sessionType: string, groupCode: string) => void = () => {},
  ) =>
    render(
      <GroupRail
        courses={withThreeTutorialGroups}
        gridCourses={withThreeTutorialGroups}
        currentSemester="FALL"
        sessionGroupSelections={selections}
        onSelectSessionGroup={onPick}
      />,
    );

  // The group code renders inside <Bidi> (RTL isolation), so the row's text is
  // split across elements — match on the button's own textContent.
  const groupRow = (code: string) =>
    screen
      .getAllByRole("button")
      .find((b) => (b.textContent ?? "").includes(`קבוצה ${code}`))!;

  it("opens on the undecided course, lists every group, and flags ours", () => {
    rail({});
    expect(screen.getByText(/בחרו קבוצת תרגול/)).toBeInTheDocument();
    // All three options, each as a full-width row (not a chip).
    expect(groupRow("01")).toBeTruthy();
    expect(groupRow("02")).toBeTruthy();
    expect(groupRow("03")).toBeTruthy();
    expect(screen.getAllByText(/ברירת מחדל/).length).toBeGreaterThan(0);
    expect(screen.getByText(/עוד לא בחרתם/)).toBeInTheDocument();
    // ≥44px tap target — a decision, not a chip.
    expect(groupRow("01").className).toMatch(/min-h-\[44px\]/);
  });

  it("a row commits ON CLICK — no hover, no focus-preview", () => {
    const picks: string[][] = [];
    rail({}, (code, type, group) => picks.push([code, type, group]));
    const row = groupRow("03");
    // Hover and focus must do nothing: on a trackpad tap they fire together
    // with the click, so the old chips previewed and committed at once.
    fireEvent.mouseEnter(row);
    fireEvent.focus(row);
    expect(picks).toHaveLength(0);
    fireEvent.click(row);
    expect(picks).toEqual([[CODE, "tutorial", "03"]]);
  });

  it("collapses to a summary once the choice is made", () => {
    rail({ [CODE]: { tutorial: "02" } });
    // Settled: the option list is closed and the header states the decision.
    expect(screen.queryByText(/בחרו קבוצת תרגול/)).toBeNull();
    expect(document.body.textContent ?? "").toMatch(/תרגול · קבוצה 02/);
    expect(screen.queryByText(/ברירת מחדל/)).toBeNull();
  });
});
