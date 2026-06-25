import { create } from "zustand";
import type { Semester } from "@/types/enums";

interface PlannerState {
  // Which year tab is selected (1-3)
  selectedYear: number;
  setSelectedYear: (year: number) => void;

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
