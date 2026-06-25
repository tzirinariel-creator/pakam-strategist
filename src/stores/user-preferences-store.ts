import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Discipline } from "@/types/enums";

interface UserPreferencesState {
  // Profile preferences (cached client-side, persisted in DB)
  focusArea: Discipline | null;
  currentYear: number;
  locale: "he" | "en";

  // Actions
  setFocusArea: (discipline: Discipline | null) => void;
  setCurrentYear: (year: number) => void;
  setLocale: (locale: "he" | "en") => void;

  // API key status (not the key itself — that's server-only)
  hasClaudeKey: boolean;
  hasGoogleConnection: boolean;
  setHasClaudeKey: (has: boolean) => void;
  setHasGoogleConnection: (has: boolean) => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      focusArea: null,
      currentYear: 1,
      locale: "he",

      setFocusArea: (discipline) => set({ focusArea: discipline }),
      setCurrentYear: (year) => set({ currentYear: year }),
      setLocale: (locale) => set({ locale }),

      hasClaudeKey: false,
      hasGoogleConnection: false,
      setHasClaudeKey: (has) => set({ hasClaudeKey: has }),
      setHasGoogleConnection: (has) => set({ hasGoogleConnection: has }),
    }),
    {
      name: "pakam-user-prefs",
    }
  )
);
