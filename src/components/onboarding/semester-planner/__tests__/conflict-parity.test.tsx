// @vitest-environment jsdom
// =========================================================================
// F5 — ONE conflict count for the planner screen.
//
// The planner ran three conflict engines at once. The insights card used
// `plan-generator.detectConflicts`, which (a) skipped any pair belonging to the
// same course and (b) never deduped the catalog's duplicate rows — 140 distinct
// meetings in the תשפ״ז data are stored more than once. The grid used
// `timetable-conflicts.findConflictPairs`, which does both. So the grid could
// paint red and name the clash while the card above it said "0" in green, and
// the "מצאו לי שילוב בלי התנגשויות" button — gated on that zero — never appeared
// for the one clash a group swap could actually fix.
//
// This locks the two surfaces to the same number over the same meetings.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

import { WeeklyTimetable, type ScheduleSessionData } from "@/components/calendar/weekly-timetable";
import { InsightsBar } from "@/components/onboarding/semester-planner/insights-bar";
import { detectPlannerConflicts } from "@/lib/planner-conflicts";
import type { CourseWithSchedule } from "@/lib/plan-generator";

interface S {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  groupCode?: string | null;
}

function course(code: string, nameHe: string, sessions: S[]): CourseWithSchedule {
  return {
    id: code,
    code,
    nameHe,
    nameEn: nameHe,
    credits: 4,
    discipline: "ECONOMICS",
    courseType: "ELECTIVE",
    isMandatory: false,
    difficultyLevel: null,
    examDateA: null,
    scheduleSessions: sessions.map((s) => ({ ...s, groupCode: s.groupCode ?? "01" })),
  } as unknown as CourseWithSchedule;
}

// Two clashes, and both of the traps that used to hide them:
//   • כלכלה × פילוסופיה overlap on Tuesday, and BOTH carry a duplicate catalog
//     row — the undeduped engine reported that single clash four times.
//   • לוגיקה's own tutorial runs over its own lecture — a real clash the old
//     engine skipped entirely because the two share a course id.
const lectureTue = { dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00", sessionType: "lecture" };
const lectureTueLate = { dayOfWeek: "TUESDAY", startTime: "11:00", endTime: "13:00", sessionType: "lecture" };
const courses: CourseWithSchedule[] = [
  course("1011-1111", "כלכלה", [lectureTue, lectureTue]),
  course("0618-2222", "פילוסופיה", [lectureTueLate, lectureTueLate]),
  course("0621-3333", "לוגיקה", [
    { dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00", sessionType: "lecture" },
    { dayOfWeek: "SUNDAY", startTime: "11:00", endTime: "13:00", sessionType: "tutorial" },
  ]),
];

const sessions: ScheduleSessionData[] = courses.flatMap((c, ci) =>
  (c.scheduleSessions ?? []).map((s, i) => ({
    id: `${c.id}-${i}`,
    courseCode: c.code,
    dayOfWeek: s.dayOfWeek as ScheduleSessionData["dayOfWeek"],
    startTime: s.startTime,
    endTime: s.endTime,
    room: null,
    building: null,
    sessionType: s.sessionType,
    groupCode: s.groupCode ?? null,
    lecturerName: null,
    course: {
      code: c.code,
      nameHe: c.nameHe,
      nameEn: c.nameEn,
      discipline: c.discipline,
      credits: c.credits,
    },
    _ci: ci,
  })),
) as ScheduleSessionData[];

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("F5 — the grid and the insights bar count the same clashes", () => {
  it("counts each real clash ONCE, duplicate catalog rows included", () => {
    const conflicts = detectPlannerConflicts(courses, true);
    // Two clashes: one between two courses, one inside לוגיקה.
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => `${c.aName}|${c.bName}`).sort()).toEqual([
      "כלכלה|פילוסופיה",
      "לוגיקה|לוגיקה",
    ]);
    expect(conflicts.find((c) => c.aName === "כלכלה")?.time).toBe("11:00–12:00");
  });

  it("the grid draws exactly that many clash lines", () => {
    const { container } = render(<WeeklyTimetable preferGrid sessions={sessions} />);
    // The clash summary is the first <ul> in the component (it renders above
    // both the agenda and the grid).
    const summary = container.querySelectorAll("ul")[0];
    expect(summary?.children).toHaveLength(detectPlannerConflicts(courses, true).length);
  });

  it("the insights bar names the same pairs — including the same-course one", () => {
    const conflicts = detectPlannerConflicts(courses, true);
    render(
      <InsightsBar selectedCourses={courses} totalCreditsPlanned={12} conflicts={conflicts} />,
    );
    // Open the details panel from the conflicts card.
    const card = screen.getByText("conflicts").closest("div.rounded-xl");
    fireEvent.click(card!);
    // Both pairs are listed — the same-course clash used to be invisible here.
    expect(screen.getAllByText("לוגיקה")).not.toHaveLength(0);
    expect(screen.getByText("כלכלה")).toBeInTheDocument();
    expect(screen.getByText("פילוסופיה")).toBeInTheDocument();
  });
});

describe("F5 — the combination finder is offered when it can help", () => {
  const clean = [course("1011-1111", "כלכלה", [lectureTue])];

  it("appears on a clash-free week that still has groups to swap", () => {
    render(
      <InsightsBar
        selectedCourses={clean}
        totalCreditsPlanned={4}
        conflicts={[]}
        canSwapGroups
        onFindCombination={() => {}}
      />,
    );
    // It used to be gated on conflictCount > 0 — hidden in exactly the case
    // where a swap could still cut a campus day.
    expect(screen.getByText(/מצאו לי שילוב/)).toBeInTheDocument();
  });

  it("stays hidden when no course offers a second group", () => {
    render(
      <InsightsBar
        selectedCourses={clean}
        totalCreditsPlanned={4}
        conflicts={[]}
        onFindCombination={() => {}}
      />,
    );
    expect(screen.queryByText(/מצאו לי שילוב/)).toBeNull();
  });
});

describe("honesty — a claim about the week only covers courses we have times for", () => {
  const withUnscheduled = [
    ...courses,
    course("0621-9999", "סמינר בלי שעות", []),
  ];

  it("says how many courses carry no hours instead of implying zero", () => {
    render(
      <InsightsBar
        selectedCourses={withUnscheduled}
        totalCreditsPlanned={16}
        conflicts={detectPlannerConflicts(withUnscheduled, true)}
        unscheduledCount={1}
      />,
    );
    expect(screen.getByText(/נבדק רק מול הקורסים שיש להם שעות/)).toBeInTheDocument();
    // The fixture has exactly ONE course without hours, so the copy is the
    // singular. This assertion used to expect "לא נספרו" and passed against
    // "1 קורסים … לא נספרו" — broken Hebrew that the test was holding in place.
    expect(screen.getByText(/קורס אחד בלי שעות ידועות לא נספר/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/1 קורסים/);
  });

  it("uses the plural once there is more than one", () => {
    const twoMissing = [
      ...courses,
      course("0621-9999", "סמינר בלי שעות", []),
      course("0621-9998", "עוד סמינר בלי שעות", []),
    ];
    render(
      <InsightsBar
        selectedCourses={twoMissing}
        totalCreditsPlanned={16}
        conflicts={detectPlannerConflicts(twoMissing, true)}
        unscheduledCount={2}
      />,
    );
    // The plural path renders the number through <Bidi>, so it is its own
    // element and the sentence is split — assert on the flattened text.
    expect(document.body.textContent).toContain("2 קורסים בלי שעות ידועות לא נספרו");
  });
});
