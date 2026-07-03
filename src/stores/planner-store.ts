import { create } from "zustand";
import type { Semester } from "@/types/enums";

interface PlannerState {
  // Which year tab is selected (1-3)
  selectedYear: number;
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
  selectedYear: 1,
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
