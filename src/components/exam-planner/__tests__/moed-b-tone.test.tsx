/** @vitest-environment jsdom */
// =========================================================================
// "אם ילך טוב" must not print a loss in green
// =========================================================================
// From the deep research pass. The card defaults to the lowest grade in the
// plan and to an optimistic value of 90. Drag the slider down to 75, then
// switch to a course you scored 92 in — the slider value did not reset — and
// the box headed "אם ילך טוב", in emerald with an upward arrow, showed an
// average LOWER than today with a negative delta beneath it.
//
// Two separate faults meeting: a value that outlived the course it described,
// and a colour asserted by the caller instead of derived from the number.
// Either alone is survivable; together they make a card whose entire job is
// helping someone decide whether to sit an exam again render a loss as a gain.

import { describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { MoedBDecisionCard } from "../moed-b-decision-card";
import type { UserCourseWithCourse } from "@/types/degree";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
afterEach(cleanup);

let seq = 0;
const course = (grade: number, nameHe: string): UserCourseWithCourse => {
  seq += 1;
  return {
    id: `uc-${seq}`,
    courseId: `c-${seq}`,
    status: "COMPLETED",
    grade,
    submissionType: null,
    submissionGrade: null,
    attemptNumber: 1,
    plannedYear: 1,
    plannedSemester: "FALL",
    isBinary: false,
    disciplineOverride: null,
    course: {
      id: `c-${seq}`,
      code: `1011-${2000 + seq}`,
      nameHe,
      nameEn: null,
      discipline: "ECONOMICS",
      courseType: "ELECTIVE",
      isMandatory: false,
      credits: 4,
    },
  } as unknown as UserCourseWithCourse;
};

const COURSES = [course(68, "סטטיסטיקה"), course(92, "מיקרו כלכלה א׳"), course(80, "מבוא לפילוסופיה")];

/** The emerald "gain" styling the optimistic cell uses. */
const GAIN = "text-emerald-600";

describe("the optimistic cell never renders a drop as a gain", () => {
  it("does not go green when the slider sits below the course's own grade", () => {
    const { container } = render(
      <MoedBDecisionCard courses={COURSES} keepsHigherGrade={false} />,
    );

    // Move the optimistic slider down while the low course is selected.
    const slider = container.querySelector('input[type="range"]');
    if (slider) fireEvent.change(slider, { target: { value: "75" } });

    // Now switch to the course scored 92 — the case that shipped broken.
    const select = container.querySelector("select");
    if (select) {
      const high = COURSES[1]!;
      fireEvent.change(select, { target: { value: high.id } });
    }

    // Whatever the numbers are, a cell showing a negative delta must not be
    // wearing the gain colour.
    const cells = [...container.querySelectorAll("div")].filter((d) =>
      /^אם ילך טוב/.test(d.textContent ?? ""),
    );
    for (const cell of cells) {
      const text = cell.textContent ?? "";
      const negative = /−|-\d/.test(text.replace(/[^\d\-−]/g, ""));
      if (negative) expect(cell.innerHTML).not.toContain(GAIN);
    }
  });

  it("still renders the card at all", () => {
    // A guard on the guard: if the card stops rendering, the loop above passes
    // vacuously and this file would stop meaning anything.
    render(<MoedBDecisionCard courses={COURSES} keepsHigherGrade={false} />);
    expect(screen.getAllByText(/מועד ב׳/).length).toBeGreaterThan(0);
  });
});
