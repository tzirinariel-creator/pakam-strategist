// @vitest-environment jsdom
// =========================================================================
// #5 (13.8) — "let us edit a row after the scan".
//
// Ariel scanned his real grade sheet. The screen told him, in his own words'
// worth of alarm, "כנראה ציון אחד או יותר נקרא לא נכון — עברו על השורות לפני
// האישור" — and then gave him nothing to press. The only choices were to
// approve a grade he could see was wrong, or drop the row.
//
// The one thing that must be true of the fix is that the EDIT IS WHAT SAVES.
// A correction that repaints the row and is then thrown away at apply time
// would look identical on screen and lose the student's work — so these tests
// drive the real component and assert on the tRPC payloads it sends.
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

// Two mandatory courses seeded at onboarding, plus an English course — English
// is the one whose pass bar differs (70, not 60), and it has to stay honest
// through an edit.
const PLAN = {
  courses: [
    {
      id: "uc-micro",
      grade: null,
      status: "IN_PROGRESS",
      course: { code: "0651-1001", nameHe: "מבוא למיקרו כלכלה", courseType: "MANDATORY" },
    },
    {
      id: "uc-philo",
      grade: null,
      status: "IN_PROGRESS",
      course: { code: "0618-1010", nameHe: "מבוא לפילוסופיה", courseType: "MANDATORY" },
    },
    {
      id: "uc-eng",
      grade: null,
      status: "IN_PROGRESS",
      course: { code: "ENG-1", nameHe: "אנגלית מתקדמים ב׳", courseType: "ENGLISH" },
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
        useQuery: () => ({
          data: { englishLevel: null, startYear: 2024, currentYear: 2, miluimGroup: "NONE" },
        }),
      },
      updateProfile: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { GradeSheetScanner } from "@/components/record/grade-sheet-scanner";

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

/** Open the correction panel of row `i` (0-based). */
function openFix(i: number) {
  fireEvent.click(screen.getAllByRole("button", { name: "תיקון" })[i]!);
}

const gradeInput = (i: number) => document.getElementById(`scan-grade-${i}`) as HTMLInputElement;
const creditsInput = (i: number) => document.getElementById(`scan-credits-${i}`) as HTMLInputElement;
const matchSelect = (i: number) => document.getElementById(`scan-match-${i}`) as HTMLSelectElement;

beforeEach(() => {
  cleanup();
  h.updateCalls = [];
  h.addCalls = [];
});

describe("GradeSheetScanner #5 — a corrected row is the row that gets saved", () => {
  it("saves the grade the student typed, not the one we misread", async () => {
    await scan([
      row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: 68, credits: 4 }),
    ]);

    openFix(0);
    // The sheet actually says 86.
    fireEvent.change(gradeInput(0), { target: { value: "86" } });
    expect(gradeInput(0).value).toBe("86");

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.updateCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([
      { userCourseId: "uc-micro", grade: 86, status: "COMPLETED" },
    ]);
  });

  it("refuses a grade outside 0-100 — nothing garbled ever reaches the mutation", async () => {
    await scan([
      row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: 88, credits: 4 }),
    ]);

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "150" } });
    // Rejected, not clamped: clamping would invent a grade the sheet never showed.
    expect(gradeInput(0).value).toBe("88");

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.updateCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([
      { userCourseId: "uc-micro", grade: 88, status: "COMPLETED" },
    ]);
  });

  it("keeps the English pass bar at 70 after an edit", async () => {
    await scan([row({ courseCode: "ENG-1", courseName: "אנגלית מתקדמים ב׳", grade: 90, credits: 4 })]);

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "65" } });
    // Declared BEFORE applying — a 65 in English is a failure, and says so.
    expect(screen.getByText(/מתחת לרף \(70\) — יירשם כנכשל/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.updateCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([{ userCourseId: "uc-eng", grade: 65, status: "FAILED" }]);
  });

  it("re-matches a row to the course the student picks, and writes to THAT course", async () => {
    // A name the scanner bound to the wrong course (or to none at all).
    await scan([row({ courseCode: null, courseName: "מבוא לפילו", grade: 91, credits: 4 })]);

    openFix(0);
    fireEvent.change(matchSelect(0), { target: { value: "uc-philo" } });
    expect(screen.getByText("יעודכן: מבוא לפילוסופיה")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.updateCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([
      { userCourseId: "uc-philo", grade: 91, status: "COMPLETED" },
    ]);
    // ...and it is NOT also written as a brand-new course.
    expect(h.addCalls).toEqual([]);
  });

  it("saves the ש״ס the student corrected on an off-plan course", async () => {
    await scan([row({ courseCode: "1031-4015", courseName: "דוגרי", grade: 92, credits: 2 })]);

    openFix(0);
    fireEvent.change(creditsInput(0), { target: { value: "4" } });

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.addCalls).toHaveLength(1));
    expect(h.addCalls[0]).toMatchObject({ courseName: "דוגרי", credits: 4, grade: 92 });
  });

  it("un-matching a row turns it into a new course instead of overwriting one", async () => {
    await scan([row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: 91, credits: 4 })]);

    openFix(0);
    fireEvent.change(matchSelect(0), { target: { value: "" } });
    expect(screen.getByText("לא בתוכנית — יתווסף לתיק עם הציון")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.addCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([]);
  });

  it("gives an in-progress (***) row a grade, and then it is saveable", async () => {
    await scan([
      row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: null, inProgress: true }),
    ]);
    // Nothing to save until the student supplies the grade themselves.
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /שמרו 0 שורות מסומנות/ })).toBeDisabled();

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "77" } });
    // Correcting a row TICKS it — a fix the student can't see being included is
    // a fix that silently gets dropped at save.
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.updateCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([{ userCourseId: "uc-micro", grade: 77, status: "COMPLETED" }]);
  });

  it("clearing a grade un-ticks the row so an empty value can never be saved", async () => {
    await scan([row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: 88, credits: 4 })]);

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "" } });
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /שמרו 0 שורות מסומנות/ })).toBeDisabled();
  });

  it("un-ticking still excludes a row the student corrected", async () => {
    await scan([
      row({ courseCode: "0651-1001", courseName: "מבוא למיקרו כלכלה", grade: 68, credits: 4 }),
      row({ courseCode: "0618-1010", courseName: "מבוא לפילוסופיה", grade: 90, credits: 4 }),
    ]);

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "86" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]!); // changed my mind — leave it out

    fireEvent.click(screen.getByRole("button", { name: /שמרו 1 שורות מסומנות/ }));
    await waitFor(() => expect(h.updateCalls).toHaveLength(1));
    expect(h.updateCalls).toEqual([
      { userCourseId: "uc-philo", grade: 90, status: "COMPLETED" },
    ]);
  });
});
