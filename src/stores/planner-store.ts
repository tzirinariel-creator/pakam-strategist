import { create } from "zustand";
import type { Semester } from "@/types/enums";

interface PlannerState {
  // Which year tab is selected (1-3). null = follow the student's own year of
  // study, exactly like `selectedSemester` below.
  //
  // Ariel, #23/#24/#27: "לדעתי תכננתי את הקורסים וזה נמחק משום מה" ·
  // "נראה שיש פה איזה באג רציני עם הסנכרון של התכנן".
  //
  // Nothing was deleted. This was hardcoded to 1 and nothing ever seeded it
  // from the profile, so a second- or third-year student landed on the year-1
  // tab — where both semester columns correctly render "0 ש״ס" and an empty
  // state, because that student has nothing planned in year 1. Their real plan
  // was one tab away and the screen gave no hint of it. The zero-course guard
  // on the page does not fire either, since rows DO exist, so no explanation
  // appeared. That is precisely what a deleted plan looks like.
  //
  // The field one line down already had the right pattern and the right
  // comment; the year field never got it.
  selectedYear: number | null;
  setSelectedYear: (year: number) => void;

  // Which semester the planner tools look at. null = follow the student's
  // current semester from the profile. SHARED by the live timetable, the
  // bidding overlap alert and the bidding worksheet — so toggling Fall/Spring
  // moves all three together (they used to silently diverge).
  selectedSemester: "FALL" | "SPRING" | null;
  setSelectedSemester: (s: "FALL" | "SPRING") => void;

  // Add course modal
  showAddCourseModal: boolean;
  targetSemester: Semester | null;
  targetYear: number | null;
  openAddModal: (year: number, semester: Semester) => void;
  closeAddModal: () => void;

}

export const usePlannerStore = create<PlannerState>()((set) => ({
  selectedYear: null,
  setSelectedYear: (year) => set({ selectedYear: year }),

  selectedSemester: null,
  setSelectedSemester: (s) => set({ selectedSemester: s }),

  showAddCourseModal: false,
  targetSemester: null,
  targetYear: null,
  openAddModal: (year, semester) =>
    set({
      showAddCourseModal: true,
      targetYear: year,
      targetSemester: semester,
    }),
  closeAddModal: () =>
    set({
      showAddCourseModal: false,
      targetYear: null,
      targetSemester: null,
    }),

}));
