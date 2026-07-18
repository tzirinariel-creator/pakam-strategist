// @vitest-environment jsdom
// =========================================================================
// Locks the FINAL-SUMMARY credit-honesty contract of StepReady (#39 QA-3 /
// #18). The finale summary must show the SAME credits that actually get saved,
// so a mid-degree student never reads "only 21 ש״ס appeared" while the
// dashboard one screen later shows more.
//
//   totalCredits      — planned courses, summed through the catalog map.
//   completedCredits  — the history step, summed with the EXACT fallback
//                       addScannedCourse persists: creditsByCode ?? c.credits ?? 2.
//                       A custom / scanned course NOT in the PPE catalog must
//                       therefore count as its OWN stored credits (or the 2
//                       floor) — NEVER 0, or the summary undercounts vs. what
//                       was written.
//   combinedCredits   — totalCredits + completedCredits (the real standing).
//
// The credit math is inline (not an exported helper), so we drive the whole
// component with controlled plan/history/catalog props, let its auto-save run
// (all tRPC mutations mocked), and read the rendered ש״ס rows. We additionally
// assert the CUSTOM course's persisted credits (addScannedCourse payload) equal
// the value the summary summed — the summary-matches-what-is-saved guarantee.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { OnboardingData } from "@/components/onboarding/onboarding-wizard";
import type { CompletedCourse } from "@/components/onboarding/step-history";
import type { PlannedSemester } from "@/components/onboarding/semester-planner/index";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// Capture what the save layer actually persists so we can prove the summary
// matches it (especially the custom-course credit fallback).
const h = vi.hoisted(() => ({
  addScannedCalls: [] as Array<{ courseCode: string | null; credits: number; courseName: string }>,
  saveCompletedCalls: [] as Array<{ courses: unknown[] }>,
  savePlanCalls: [] as Array<{ courses: unknown[] }>,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/advisor-toast", () => ({
  advisorError: vi.fn(),
  advisorSuccess: vi.fn(),
}));

vi.mock("@/lib/ics-export", () => ({ downloadICSFromSessions: vi.fn() }));

// Stub the heavy character-driven children so the finale mounts cleanly; they
// are irrelevant to the credit math under test.
vi.mock("@/components/persona/persona-picker", () => ({ PersonaPicker: () => null }));
vi.mock("@/components/ui/philosopher-king-character", () => ({
  PhilosopherKingCharacter: () => null,
}));

vi.mock("@/lib/trpc/react", () => {
  const okMutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  });
  return {
    api: {
      user: {
        updateProfile: { useMutation: () => okMutation() },
        upsertMiluimSemester: { useMutation: () => okMutation() },
        getProfile: { useQuery: () => ({ data: undefined }) },
      },
      plan: {
        savePlan: {
          useMutation: () => ({
            mutate: vi.fn(),
            mutateAsync: vi.fn(async (a: { courses: unknown[] }) => {
              h.savePlanCalls.push(a);
              return {};
            }),
            isPending: false,
          }),
        },
        saveCompletedCourses: {
          useMutation: () => ({
            mutate: vi.fn(),
            mutateAsync: vi.fn(async (a: { courses: unknown[] }) => {
              h.saveCompletedCalls.push(a);
              return {};
            }),
            isPending: false,
          }),
        },
        addScannedCourse: {
          useMutation: () => ({
            mutate: vi.fn(),
            mutateAsync: vi.fn(
              async (a: { courseCode: string | null; credits: number; courseName: string }) => {
                h.addScannedCalls.push(a);
                return {};
              },
            ),
            isPending: false,
          }),
        },
      },
      schedule: {
        getScheduleForSemester: { useQuery: () => ({ data: { sessions: [] } }) },
        getGoogleStatus: { useQuery: () => ({ data: { configured: false, connected: false } }) },
        syncToGoogle: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
      useUtils: () => ({
        plan: {
          getCredits: { invalidate: vi.fn() },
          getGraduationScore: { invalidate: vi.fn() },
        },
        user: { getProfile: { invalidate: vi.fn() } },
      }),
    },
  };
});

import { StepReady } from "@/components/onboarding/step-ready";

// ── Fixtures ─────────────────────────────────────────────────────────────
// A catalog course as StepReady reads it: only id / code / credits matter.
function cat(id: string, code: string, credits: number): CourseWithSchedule {
  return { id, code, credits } as unknown as CourseWithSchedule;
}

const DATA: OnboardingData = {
  program: "ppe",
  year: 2,
  semester: "FALL",
  focusArea: null,
  miluimGroup: "NONE",
  amirantScore: null,
  englishLevel: null,
};

/** Read the value span sitting next to a summary-row label. */
function rowValue(label: string): string {
  return screen.getByText(label).nextElementSibling?.textContent?.trim() ?? "";
}

// Hebrew (isHe) summary-row labels used across the summary card.
const L_PLANNED_CREDITS = "ש״ס בתכנון";
const L_DONE_CREDITS = "ש״ס שכבר השלמת";
const L_COMBINED = "סה״כ לתואר עד כה";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.addScannedCalls.length = 0;
  h.saveCompletedCalls.length = 0;
  h.savePlanCalls.length = 0;
});

describe("StepReady — final-summary credit honesty (#39 QA-3 / #18)", () => {
  it("sums planned + completed through the catalog, and a custom course counts as its OWN credits (or the 2 floor), never 0", async () => {
    // Catalog: two planned courses (4 + 6) and one catalog completed (5).
    const allCourses = [
      cat("cat-1", "PLAN-A", 4),
      cat("cat-2", "PLAN-B", 6),
      cat("cat-3", "DONE-CAT", 5),
    ];
    const plannedSemesters: PlannedSemester[] = [
      { year: 2, semester: "FALL", courseIds: ["cat-1", "cat-2"] }, // planned = 10
    ];
    const completedCourses: CompletedCourse[] = [
      // catalog completed → counted via creditsByCode = 5
      { courseCode: "DONE-CAT", plannedYear: 1, plannedSemester: "FALL", grade: 88 },
      // custom completed WITH stored credits → counts as 3 (not in catalog, not 0)
      { courseCode: "CUSTOM-abc", customName: "דוגרי", credits: 3, plannedYear: 1, plannedSemester: "FALL", grade: 90 },
      // custom completed WITHOUT credits → falls back to 2 (the addScannedCourse floor)
      { courseCode: "CUSTOM-def", customName: "קורס חופשי", credits: null, plannedYear: 1, plannedSemester: "FALL", grade: null },
    ];

    render(
      <StepReady
        data={DATA}
        plannedSemesters={plannedSemesters}
        completedCourses={completedCourses}
        allCourses={allCourses}
      />,
    );

    // Wait for the auto-save to finish (hasSaved-gated CTA appears only then).
    await screen.findByText("goToDashboard", undefined, { timeout: 3000 });

    // planned = 4 + 6 = 10
    expect(rowValue(L_PLANNED_CREDITS)).toBe("10");
    // completed = 5 (catalog) + 3 (stored) + 2 (fallback) = 10.
    // If the customs were undercounted to 0 this would read 5 — the bug.
    expect(rowValue(L_DONE_CREDITS)).toBe("10");
    // combined = 10 + 10 = 20 (never 15, which is the undercounted plan+catalog-only).
    expect(rowValue(L_COMBINED)).toBe("20");
    expect(rowValue(L_COMBINED)).not.toBe("15");
    // planned course COUNT excludes nothing here → 2.
    expect(rowValue("planCoursesCount")).toBe("2");
  });

  it("the completed-credit fallback shown in the summary equals what addScannedCourse persists", async () => {
    const allCourses = [cat("cat-1", "PLAN-A", 4), cat("cat-3", "DONE-CAT", 5)];
    const plannedSemesters: PlannedSemester[] = [
      { year: 2, semester: "FALL", courseIds: ["cat-1"] },
    ];
    const completedCourses: CompletedCourse[] = [
      { courseCode: "DONE-CAT", plannedYear: 1, plannedSemester: "FALL", grade: 88 },
      { courseCode: "CUSTOM-abc", customName: "דוגרי", credits: 3, plannedYear: 1, plannedSemester: "FALL", grade: 90 },
      { courseCode: "CUSTOM-def", customName: "קורס חופשי", credits: null, plannedYear: 1, plannedSemester: "FALL", grade: null },
    ];

    render(
      <StepReady
        data={DATA}
        plannedSemesters={plannedSemesters}
        completedCourses={completedCourses}
        allCourses={allCourses}
      />,
    );
    await screen.findByText("goToDashboard", undefined, { timeout: 3000 });

    // Summary completed total = 5 + 3 + 2 = 10.
    expect(rowValue(L_DONE_CREDITS)).toBe("10");

    // The two customs were persisted via addScannedCourse with the SAME credits
    // the summary summed (3 and the 2-floor) — proving summary === saved.
    expect(h.addScannedCalls).toHaveLength(2);
    const dugri = h.addScannedCalls.find((c) => c.courseName === "דוגרי");
    const free = h.addScannedCalls.find((c) => c.courseName === "קורס חופשי");
    expect(dugri).toBeDefined();
    expect(free).toBeDefined();
    expect(dugri?.credits).toBe(3);
    expect(free?.credits).toBe(2);
    // A CUSTOM-<uuid> placeholder code is persisted as null (no fake catalog code).
    expect(dugri?.courseCode).toBeNull();
    expect(free?.courseCode).toBeNull();
  });

  it("a lone custom course with no stored credits counts as the 2 floor, not 0", async () => {
    const allCourses = [cat("cat-1", "PLAN-A", 4)];
    const plannedSemesters: PlannedSemester[] = [
      { year: 2, semester: "FALL", courseIds: ["cat-1"] }, // planned = 4
    ];
    const completedCourses: CompletedCourse[] = [
      { courseCode: "CUSTOM-only", customName: "קורס חיצוני", credits: null, plannedYear: 1, plannedSemester: "FALL", grade: null },
    ];

    render(
      <StepReady
        data={DATA}
        plannedSemesters={plannedSemesters}
        completedCourses={completedCourses}
        allCourses={allCourses}
      />,
    );
    await screen.findByText("goToDashboard", undefined, { timeout: 3000 });

    expect(rowValue(L_PLANNED_CREDITS)).toBe("4");
    expect(rowValue(L_DONE_CREDITS)).toBe("2"); // the fallback floor, NOT 0
    expect(rowValue(L_COMBINED)).toBe("6"); // 4 + 2
  });
});
