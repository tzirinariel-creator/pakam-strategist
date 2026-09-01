/** @vitest-environment jsdom */
// =========================================================================
// #36 — הנגשת מצב הסימולציה
// =========================================================================
// The way in was a hand-rolled `fixed inset-0` div. It looked like a dialog and
// behaved like nothing: no role, no aria-modal, no accessible name, no Escape,
// no focus trap, no focus restore, and a backdrop that ignored clicks. Someone
// navigating by keyboard could tab straight through it into the page behind
// while it was still covering the screen, and a screen reader was never told
// anything had opened.
//
// The app already owns a Radix dialog that eight other modals use. This pins
// the swap, because "we used the right component" is the kind of thing that
// silently gets un-done in a later refactor.
//
// It also pins the LABEL. "מצב סימולציה" is what the app calls the feature;
// "מה יקרה לממוצע אם…" is what the student came to find out. Ariel's note is
// about the second kind of sentence.

import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GradeSimulator } from "../grade-simulator";
import type { UserCourseWithCourse } from "@/types/degree";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
afterEach(cleanup);

let seq = 0;
const course = (grade: number): UserCourseWithCourse => {
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
      code: `1011-${3000 + seq}`,
      nameHe: `קורס ${seq}`,
      nameEn: null,
      discipline: "ECONOMICS",
      courseType: "ELECTIVE",
      isMandatory: false,
      credits: 4,
    },
  } as unknown as UserCourseWithCourse;
};

const COURSES = [course(84), course(91), course(77)];

const open = () => {
  render(<GradeSimulator courses={COURSES} preferHigherGrade={false} />);
  fireEvent.click(screen.getByRole("button", { name: /מה יקרה לממוצע/ }));
};

describe("the way into the simulator is a real dialog", () => {
  it("names the entry by the question it answers, not by the mode", () => {
    render(<GradeSimulator courses={COURSES} preferHigherGrade={false} />);
    expect(screen.getByRole("button", { name: /מה יקרה לממוצע/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^מצב סימולציה$/ })).not.toBeInTheDocument();
  });

  it("opens something the accessibility tree can see as a dialog", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // An unnamed dialog is announced as "dialog" and nothing else.
    expect(dialog).toHaveAccessibleName(expect.stringMatching(/מה יקרה לממוצע/) as unknown as string);
  });

  it("says nothing is saved BEFORE the student commits, not after", () => {
    open();
    expect(screen.getByText(/שום דבר כאן לא נשמר/)).toBeInTheDocument();
  });

  it("closes on Escape — the hand-rolled version ignored the key entirely", () => {
    open();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("still lets the student through to the simulator", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /בואו נראה/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The active simulator names the average it is moving.
    expect(screen.getAllByText(/ממוצע/).length).toBeGreaterThan(0);
  });
});
