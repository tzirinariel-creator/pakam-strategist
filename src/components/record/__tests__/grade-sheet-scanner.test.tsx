// @vitest-environment jsdom
// =========================================================================
// #28 — "the import silently skips electives".
//
// Ariel uploaded his real grade sheet and his elective courses (1031-4015
// דוגרי, 1880-0901 משבר האקלים וקיימות, a Python course) were never recorded,
// while mandatory courses came in fine. The asymmetry is structural: onboarding
// seeds every MANDATORY course into the plan, so a scanned mandatory row always
// finds a `match` and rides the bulk apply. An elective the student chose
// themselves has no UserCourse, so `match` was null — and the apply loop did
// `if (!r.match) continue`, dropping exactly those rows. The student pressed
// "עדכנו", was told "עודכנו N קורסים", and the work they'd actually done was
// gone.
//
// This test drives the real component through a real scan response and locks
// in: an unmatched graded row is pre-checked, and pressing save routes it to
// addScannedCourse with the sheet's grade — not silently skipped.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  updateCalls: [] as unknown[],
  addCalls: [] as unknown[],
  scanRows: [] as unknown[],
}));

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/advisor-toast", () => ({ advisorError: vi.fn() }));
vi.mock("@/lib/trpc/invalidate-plan", () => ({ invalidatePlanData: vi.fn() }));
vi.mock("@/components/record/where-is-my-sheet", () => ({ WhereIsMySheet: () => null }));
vi.mock("@/components/cohort/cohort-share-nudge", () => ({ CohortShareNudge: () => null }));
vi.mock("@/lib/upload", () => ({
  fileToBase64: async () => ({ b64: "x".repeat(200), mime: "image/png" }),
  SCANNER_ACCEPT: "image/*",
}));

// The student's plan: ONE mandatory course, seeded at onboarding. No electives —
// exactly the state every real student is in before their first scan.
const PLAN = {
  courses: [
    {
      id: "uc-micro",
      grade: null,
      status: "IN_PROGRESS",
      course: { code: "0651-1001", nameHe: "מבוא למיקרו כלכלה", courseType: "MANDATORY" },
    },
  ],
};

vi.mock("@/lib/trpc/react", () => ({
  api: {
    useUtils: () => ({
      plan: {
        getUserPlan: { fetch: async () => PLAN, invalidate: vi.fn() },
        getCredits: { invalidate: vi.fn() },
      },
      user: { getProfile: { invalidate: vi.fn() } },
    }),
    plan: {
      getUserPlan: { useQuery: () => ({ data: PLAN, isLoading: false }) },
      updateCourse: {
        useMutation: () => ({
          mutateAsync: async (v: unknown) => {
            h.updateCalls.push(v);
            return { ok: true };
          },
          isPending: false,
        }),
      },
      addScannedCourse: {
        useMutation: () => ({
          mutateAsync: async (v: unknown) => {
            h.addCalls.push(v);
            return { ok: true, courseId: "c", courseName: "x" };
          },
          isPending: false,
        }),
      },
    },
    user: {
      getProfile: {
        useQuery: () => ({ data: { englishLevel: null, startYear: 2024, currentYear: 2, miluimGroup: "NONE" } }),
      },
      updateProfile: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { GradeSheetScanner } from "@/components/record/grade-sheet-scanner";

/** Upload a file and let the mocked /api/ai/scan-grades answer with `rows`. */
async function scan(rows: unknown[]) {
  h.scanRows = rows;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ rows: h.scanRows }) })),
  );
  render(<GradeSheetScanner />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "sheet.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByText(/נמצא[הו] .*(שורה אחת|שורות)/)).toBeInTheDocument());
}

const row = (over: Record<string, unknown>) => ({
  courseCode: null, courseName: "x", grade: null, credits: null, passText: null,
  semester: "2025/1", inProgress: false, ...over,
});

beforeEach(() => {
  cleanup();
  h.updateCalls = [];
  h.addCalls = [];
});

describe("GradeSheetScanner #28 — electives are imported, not skipped", () => {
  it("saves BOTH the planned mandatory course and the off-plan electives", async () => {
    await scan([
      // In the plan (mandatory) — the case that always worked.
      row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: 91, credits: 4 }),
      // Ariel's real electives — none of these are in any plan.
      row({ courseCode: "1031-4015", courseName: "דוגרי", grade: 92, credits: 2 }),
      row({ courseCode: "1880-0901", courseName: "משבר האקלים וקיימות", grade: 88, credits: 4, semester: "2025/2" }),
    ]);

    // All three rows are pre-checked — the electives are no longer dead rows.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const b of boxes) expect(b).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /שמרו 3 שורות מסומנות/ })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /שמרו 3 שורות מסומנות/ }));

    await waitFor(() => expect(h.addCalls).toHaveLength(2));
    // The mandatory course still goes through the update path, unchanged.
    expect(h.updateCalls).toEqual([
      { userCourseId: "uc-micro", grade: 91, status: "COMPLETED" },
    ]);
    // Both electives are actually written, with the sheet's own grade, and
    // placed from the sheet's semester + the student's start year (2024).
    expect(h.addCalls).toEqual([
      {
        courseCode: "1031-4015", courseName: "דוגרי", credits: 2, grade: 92,
        status: "COMPLETED", plannedYear: 2, plannedSemester: "FALL",
      },
      {
        courseCode: "1880-0901", courseName: "משבר האקלים וקיימות", credits: 4, grade: 88,
        status: "COMPLETED", plannedYear: 2, plannedSemester: "SPRING",
      },
    ]);
  });

  it("declares an off-plan elective before writing it, and never pre-checks a failure", async () => {
    await scan([
      row({ courseCode: "1031-4015", courseName: "דוגרי", grade: 92, credits: 2 }),
      row({ courseCode: "0509-1819", courseName: "מבוא לפייתון", grade: 45, credits: 3 }),
    ]);

    expect(screen.getByText("לא בתוכנית — יתווסף לתיק עם הציון")).toBeInTheDocument();
    expect(screen.getByText("לא בתוכנית — יתווסף לתיק כנכשל")).toBeInTheDocument();

    // A failing elective is recordable, but the student must tick it themselves.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[1]).toHaveAttribute("aria-checked", "false");
    expect(boxes[1]).toBeEnabled();

    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: /שמרו 2 שורות מסומנות/ }));
    await waitFor(() => expect(h.addCalls).toHaveLength(2));
    // ...and it is recorded as FAILED, not as a silent COMPLETED.
    expect((h.addCalls[1] as { status: string }).status).toBe("FAILED");
  });

  it("still refuses to record an in-progress (***) row", async () => {
    await scan([
      row({ courseCode: "1031-4015", courseName: "דוגרי", grade: null, inProgress: true }),
    ]);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("בלימוד — עדיין אין ציון")).toBeInTheDocument();
  });
});
