// @vitest-environment jsdom
// =========================================================================
// #5 + #7 (13.8) — onboarding's grade-sheet review, now editable and singular.
//
// The standing screen printed "זה מה שקראנו מהגיליון" behind a collapsed
// <details>, with no control of any kind, and the REAL review lived two steps
// later ("למה יש עוד שלב של מעבר על הגיליון - זאת קצת כפילות"). The review is
// now here, once — which means every capability the history step had must
// survive here: drop a row, fix a grade, add a course we missed.
//
// What these tests actually guard is the hand-off: `onDone`'s `completedSeed`
// is what the wizard puts in state and step-ready sends to
// plan.saveCompletedCourses. If a correction doesn't reach that payload, it is
// a correction the student watched us throw away.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { StandingResult } from "@/components/onboarding/step-standing";

const h = vi.hoisted(() => ({ scanRows: [] as unknown[] }));

vi.mock("next-intl", () => ({ useLocale: () => "he", useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/record/where-is-my-sheet", () => ({ WhereIsMySheet: () => null }));
vi.mock("@/lib/upload", () => ({
  fileToBase64: async () => ({ b64: "x".repeat(200), mime: "image/png" }),
  SCANNER_ACCEPT: "image/*",
}));

import { StepStanding } from "@/components/onboarding/step-standing";

// A miniature PPE catalog. ENG-1 carries the one pass bar that differs (70).
const CATALOG = [
  { id: "c1", code: "0651-1001", nameHe: "מבוא לפילוסופיה", nameEn: "Intro to Philosophy", credits: 4, courseType: "MANDATORY", isMandatory: true, discipline: "PHILOSOPHY", canCountAs: [], yearOffered: [1], semesterOffered: ["FALL"] },
  { id: "c2", code: "1011-1001", nameHe: "מבוא לכלכלה", nameEn: "Intro to Economics", credits: 5, courseType: "MANDATORY", isMandatory: true, discipline: "ECONOMICS", canCountAs: [], yearOffered: [1], semesterOffered: ["FALL"] },
  { id: "c3", code: "1031-1001", nameHe: "מבוא למדע המדינה", nameEn: "Intro to Politics", credits: 4, courseType: "MANDATORY", isMandatory: true, discipline: "POLITICS", canCountAs: [], yearOffered: [1], semesterOffered: ["SPRING"] },
  { id: "c4", code: "ENG-1", nameHe: "אנגלית מתקדמים ב׳", nameEn: "English Advanced B", credits: 4, courseType: "ENGLISH", isMandatory: false, discipline: "GENERAL", canCountAs: [], yearOffered: [1], semesterOffered: ["FALL"] },
] as unknown as CourseWithSchedule[];

const row = (over: Record<string, unknown>) => ({
  courseCode: null, courseName: "x", grade: null, credits: null, passText: null,
  semester: "2024/1", inProgress: false, ...over,
});

/** Render, choose the "I already have credits" path, upload, and wait for the
 *  review. Returns the onDone spy so tests can assert on the hand-off. */
async function review(rows: unknown[], extra: Record<string, unknown> = {}) {
  h.scanRows = rows;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: h.scanRows, englishLevel: null, ...extra }),
    })),
  );
  const onDone = vi.fn();
  render(
    <StepStanding
      allCourses={CATALOG}
      isLoadingCourses={false}
      onDone={onDone}
      onBack={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /כבר יש לכם ש״ס/ }));
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File(["x"], "s.png", { type: "image/png" })] });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByText("זה מה שקראנו מהגיליון")).toBeInTheDocument());
  return onDone;
}

function openFix(i: number) {
  fireEvent.click(screen.getAllByRole("button", { name: "תיקון" })[i]!);
}
const gradeInput = (i: number) => document.getElementById(`standing-grade-${i}`) as HTMLInputElement;
const creditsInput = (i: number) => document.getElementById(`standing-credits-${i}`) as HTMLInputElement;
const courseSelect = (i: number) => document.getElementById(`standing-course-${i}`) as HTMLSelectElement;
const confirm = () => fireEvent.click(screen.getByRole("button", { name: /נכון — המשיכו מכאן/ }));
const seedOf = (onDone: ReturnType<typeof vi.fn>) =>
  (onDone.mock.calls[0]![0] as StandingResult).completedSeed!;

beforeEach(() => cleanup());

describe("StepStanding #5 — the review is editable, and the edit is what is handed on", () => {
  it("hands on the grade the student typed, not the one we misread", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 68 }),
    ]);

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "86" } });
    expect(gradeInput(0).value).toBe("86");

    confirm();
    expect(seedOf(onDone)["0651-1001"]).toMatchObject({ courseCode: "0651-1001", grade: 86 });
  });

  it("refuses an out-of-range grade instead of clamping it", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 }),
    ]);
    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "150" } });
    expect(gradeInput(0).value).toBe("88");
    confirm();
    expect(seedOf(onDone)["0651-1001"]).toMatchObject({ grade: 88 });
  });

  it("keeps English at the 70 bar — a corrected 65 stops being a completion", async () => {
    const onDone = await review([
      row({ courseCode: "ENG-1", courseName: "אנגלית מתקדמים ב׳", grade: 90 }),
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 }),
    ]);

    openFix(0);
    fireEvent.change(gradeInput(0), { target: { value: "65" } });
    expect(screen.getByText("לא עבר")).toBeInTheDocument();

    confirm();
    // A failure is never seeded as a completed course — it would inflate both
    // the credit count and the average.
    expect(Object.keys(seedOf(onDone))).toEqual(["0651-1001"]);
  });

  it("un-ticking a row keeps it on screen and out of the degree", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 90 }),
    ]);

    fireEvent.click(screen.getByRole("checkbox", { name: "כללו את מבוא לכלכלה" }));
    // Still visible — the student can see and undo what they just did.
    expect(screen.getByText("מבוא לכלכלה")).toBeInTheDocument();

    confirm();
    expect(Object.keys(seedOf(onDone))).toEqual(["0651-1001"]);
  });

  it("re-matches a row to the right course and seeds THAT course", async () => {
    const onDone = await review([
      // A name the matcher couldn't bind to anything in the catalog.
      row({ courseCode: null, courseName: "מבוא לכלכ", grade: 91, credits: 3 }),
    ]);

    openFix(0);
    fireEvent.change(courseSelect(0), { target: { value: "1011-1001" } });

    confirm();
    const seed = seedOf(onDone);
    expect(Object.keys(seed)).toEqual(["1011-1001"]);
    // A catalog course carries no customName — it saves through the catalog path.
    expect(seed["1011-1001"]?.customName).toBeUndefined();
    expect(seed["1011-1001"]?.grade).toBe(91);
  });

  it("keeps a corrected ש״ס on a course outside the PPE list", async () => {
    const onDone = await review([
      row({ courseCode: "1031-4015", courseName: "דוגרי", grade: 92, credits: 2 }),
    ]);

    openFix(0);
    fireEvent.change(creditsInput(0), { target: { value: "4" } });

    confirm();
    expect(seedOf(onDone)["1031-4015"]).toMatchObject({ customName: "דוגרי", credits: 4, grade: 92 });
  });
});

describe("StepStanding #7 — the capabilities the history step used to own", () => {
  it("adds a catalog course the scan missed entirely", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 }),
    ]);

    fireEvent.change(screen.getByLabelText("חיפוש קורס להוספה"), {
      target: { value: "מדע המדינה" },
    });
    fireEvent.click(screen.getByRole("button", { name: /מבוא למדע המדינה/ }));
    // Never dressed up as something we read off the document.
    expect(screen.getByText("הוספתם")).toBeInTheDocument();

    confirm();
    expect(Object.keys(seedOf(onDone)).sort()).toEqual(["0651-1001", "1031-1001"]);
  });

  it("adds a course that isn't in the PPE list at all, with an editable grade", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 }),
    ]);

    fireEvent.change(screen.getByLabelText("חיפוש קורס להוספה"), { target: { value: "דוגרי" } });
    fireEvent.click(screen.getByRole("button", { name: /קורס שאינו ברשימת פכ״מ/ }));

    openFix(1);
    fireEvent.change(gradeInput(1), { target: { value: "92" } });
    fireEvent.change(creditsInput(1), { target: { value: "4" } });

    confirm();
    expect(seedOf(onDone)["CUSTOM-דוגרי"]).toMatchObject({
      customName: "דוגרי",
      credits: 4,
      grade: 92,
    });
  });

  it("no longer promises a correction screen that does not exist", async () => {
    await review([row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 })]);
    expect(screen.queryByText(/במסך הבא תוכלו לתקן קורס-קורס/)).not.toBeInTheDocument();
    expect(screen.getByText(/תקנו כאן כל שורה שנקראה לא נכון/)).toBeInTheDocument();
  });
});

// =========================================================================
// #2a (13.8) — "משום מה הוא לא הצליח לקלוט שעשיתי לוגיקה". A course he passed
// was shown as "בלימוד", with no grade and no obvious way to say otherwise.
// =========================================================================
describe("StepStanding #2a — a course with a grade is never reported as בלימוד", () => {
  it("shows a row that carries both a grade and the *** flag as completed", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, inProgress: true }),
    ]);
    expect(screen.getByText("הושלם")).toBeInTheDocument();
    expect(screen.queryByText("בלימוד")).not.toBeInTheDocument();
    confirm();
    expect(seedOf(onDone)["0651-1001"]).toMatchObject({ grade: 88 });
  });

  it("offers the grade the other read saw, and one tap makes it the grade", async () => {
    // What the merge hands over when one read saw 89 and the other saw an empty
    // grade cell: nothing asserted, both readings kept.
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: null, uncertain: true, otherGrade: 89 }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 90 }),
    ]);
    // Not asserted as a fact about the document…
    expect(screen.getByText("לא ברור")).toBeInTheDocument();
    expect(screen.queryByText("בלימוד")).not.toBeInTheDocument();
    // …and the number we do have is offered, not buried.
    expect(screen.getByText("באחת הקריאות יצא")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "זה הציון" }));
    expect(screen.queryByText("לא ברור")).not.toBeInTheDocument();
    expect(screen.getAllByText("הושלם")).toHaveLength(2);

    confirm();
    expect(seedOf(onDone)["0651-1001"]).toMatchObject({ grade: 89 });
  });

  it("gives an ungraded row a named way in, and the typed grade counts", async () => {
    const onDone = await review([
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: null, inProgress: true }),
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 90 }),
    ]);
    expect(screen.getByText("בלימוד")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /להזין ציון/ })[0]!);
    fireEvent.change(gradeInput(0), { target: { value: "88" } });

    confirm();
    const seed = seedOf(onDone);
    expect(Object.keys(seed).sort()).toEqual(["0651-1001", "1011-1001"]);
    expect(seed["0651-1001"]).toMatchObject({ grade: 88 });
  });

  it("says out loud when the grades read don't add up to the printed average", async () => {
    await review(
      [row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 })],
      { averageMismatch: { computed: 91.2, printed: 94 } },
    );
    expect(screen.getByText("יש פער מול הממוצע שמודפס בגיליון")).toBeInTheDocument();
  });

  it("stays quiet about the average when the scanner found no gap", async () => {
    await review([row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 })]);
    expect(screen.queryByText("יש פער מול הממוצע שמודפס בגיליון")).not.toBeInTheDocument();
  });
});

// =========================================================================
// #2b — "עדיף שזה יחולק לסמסטרים בסיכום ביניים הזה".
// =========================================================================
describe("StepStanding #2b — the review is split into the sheet's semesters", () => {
  const scanned = () =>
    review([
      row({ courseCode: "1011-1001", courseName: "מבוא לכלכלה", grade: 91, semester: "2025/2" }),
      row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88, semester: "2024/1" }),
      row({ courseCode: "1031-1001", courseName: "מבוא למדע המדינה", grade: 76, semester: null }),
    ]);

  it("heads each block with the sheet's own semester, earliest first", async () => {
    await scanned();
    const body = document.body.textContent!;
    expect(screen.getByText("שנה א׳ · סמסטר א׳")).toBeInTheDocument();
    expect(screen.getByText("שנה ב׳ · סמסטר ב׳")).toBeInTheDocument();
    // The raw header is shown too — the student can check it against the sheet.
    expect(screen.getAllByText("2024/1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2025/2").length).toBeGreaterThan(0);
    expect(body.indexOf("שנה א׳ · סמסטר א׳")).toBeLessThan(body.indexOf("שנה ב׳ · סמסטר ב׳"));
  });

  it("puts a row the sheet didn't date in its own labelled block, last", async () => {
    await scanned();
    const body = document.body.textContent!;
    expect(screen.getByText("סמסטר לא ידוע")).toBeInTheDocument();
    expect(body.indexOf("שנה ב׳ · סמסטר ב׳")).toBeLessThan(body.indexOf("סמסטר לא ידוע"));
  });

  it("keeps every per-row control working after the split", async () => {
    const onDone = await scanned();
    // The rows are re-ordered on screen; the edit must still land on the row the
    // student is looking at, not on whatever was at that index in the scan.
    fireEvent.click(screen.getByRole("checkbox", { name: "כללו את מבוא לפילוסופיה" }));
    openFix(1); // second row on screen — מבוא לכלכלה (2025/2)
    fireEvent.change(gradeInput(0), { target: { value: "95" } });

    confirm();
    const seed = seedOf(onDone);
    expect(Object.keys(seed).sort()).toEqual(["1011-1001", "1031-1001"]);
    expect(seed["1011-1001"]).toMatchObject({ grade: 95 });
  });
});

// =========================================================================
// #3 — "הלחצנים למטה נראים מוזר": two bare text links on one line, reading as
// one broken sentence under the primary action.
// =========================================================================
describe("StepStanding #3 — the two escape hatches are real, separated controls", () => {
  it("offers both as buttons, and the manual one no longer reads as a fragment", async () => {
    const onDone = await review([row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 })]);
    expect(screen.getByRole("button", { name: /לסרוק קובץ אחר/ })).toBeInTheDocument();
    const manual = screen.getByRole("button", { name: /לא מדויק\? נמלא ידנית/ });
    fireEvent.click(manual);
    expect(onDone).toHaveBeenCalledWith({ choice: "returning" });
  });

  it("scanning another file returns to the upload screen, review discarded", async () => {
    await review([row({ courseCode: "0651-1001", courseName: "מבוא לפילוסופיה", grade: 88 })]);
    fireEvent.click(screen.getByRole("button", { name: /לסרוק קובץ אחר/ }));
    expect(screen.getByText("העלו את גיליון הציונים")).toBeInTheDocument();
  });
});
