// @vitest-environment jsdom
// =========================================================================
// לוח הבקרה — שני הדברים שקל לשבור בו בלי לשים לב
// =========================================================================
// 1. **הגבול על הפרטיות.** המסך סופר ולא קורא: כמה ציונים הוזנו, לא מה הם.
//    זו לא הערה בקוד אלא חוזה — אריאל הוא בעל האפליקציה, לא המרצה, והסטודנטים
//    העלו גיליונות לכלי תכנון. בדיקה שנופלת אם מישהו יוסיף עמודת ציון לטבלת
//    המשתמשים שווה יותר מהערה שאפשר לדלג עליה.
//
// 2. **חשבון המשפך.** האחוזים והנשירה בין שלבים מחושבים ידנית כאן, ומספר
//    שגוי בלוח בקרה גרוע ממסך שלא קיים — כי מחליטים לפיו.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/he/admin" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const overview = {
  generatedAt: new Date().toISOString(),
  users: { total: 40, today: 6, last7: 12, last30: 20, admins: 2 },
  funnel: {
    registered: 40, declaredYear: 26, withPlan: 20, withGrades: 10,
    returned: 17, googleLinked: 3, withMiluim: 5,
  },
  content: {
    userCourses: 277, gradedRows: 109, completedRows: 112, plannedRows: 150,
    miluimRows: 10, studyTasks: 60, chatSessions: 3, reviews: 0, insights: 0,
    sharedPlans: 0, gradePoints: 12, mentorLinks: 0, syllabi: 0, notes: 0,
    materials: 0, calendarEvents: 0,
  },
  cohort: {
    byFocus: [{ key: null, n: 31 }, { key: "ECONOMICS", n: 8 }, { key: "PHILOSOPHY", n: 1 }],
    byMiluim: [{ key: "NONE", n: 35 }, { key: "GROUP_C", n: 5 }],
    byStartYear: [{ key: null, n: 13 }, { key: 2025, n: 25 }, { key: 2024, n: 2 }],
    byEnglish: [{ key: null, n: 40 }],
  },
  signupsByDay: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    count: i === 29 ? 6 : 0,
  })),
  catalog: { total: 346, active: 305, withSchedule: 227, sessions: 370, withExamDates: 200 },
  health: {
    lastSync: { status: "success", startedAt: new Date().toISOString(), changesFound: 4, changesApplied: 4 },
    pendingReviews: 0, pendingInsights: 0, reportedReviews: 0,
  },
  recentUsers: [
    {
      email: "student@mail.tau.ac.il", name: "דנה", createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), startYear: 2025, focusArea: "ECONOMICS",
      isAdmin: false, googleLinked: false, courses: 12, chats: 1, tasks: 3, miluim: 0,
    },
  ],
  topPlanned: [
    { code: "1411-9107", nameHe: "חקיקה ורגולציה", credits: 4, courseType: "MANDATORY", count: 8 },
    { code: "0651-1005", nameHe: 'סטטיסטיקה לפכ"מ', credits: 5, courseType: "MANDATORY", count: 6 },
  ],
};

vi.mock("@/lib/trpc/react", () => ({
  api: {
    admin: {
      getOverview: {
        useQuery: () => ({ data: overview, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
      },
    },
  },
}));

import { AdminOverview } from "../admin-overview";

beforeEach(() => {
  cleanup();
  // ה-fetch ל-/api/health חי מחוץ ל-tRPC; מדומה כדי שהרינדור לא יתלוי ברשת.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    json: async () => ({ ok: true, db: true, ai: { alive: true, respondingModel: "gemini", lastStatus: 200 } }),
  })) as unknown as typeof fetch);
});

describe("לוח הבקרה — הגבול על הפרטיות", () => {
  it("טבלת המשתמשים לא מכילה עמודת ציון או ממוצע", () => {
    render(<AdminOverview />);
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers.join(" ")).not.toMatch(/ציון|ממוצע/);
    // העמודות שכן קיימות הן ספירות והקשר, לא תוכן.
    expect(headers).toContain("מייל");
    expect(headers).toContain("קורסים");
  });

  it("אומר במפורש שהוא סופר ולא קורא", () => {
    render(<AdminOverview />);
    expect(screen.getByText(/המסך הזה סופר ולא קורא/)).toBeInTheDocument();
  });
});

describe("לוח הבקרה — חשבון המשפך", () => {
  it("כל שלב מוצג עם המספר והאחוז שלו מתוך הנרשמים", () => {
    render(<AdminOverview />);
    // 26/40 = 65% · 20/40 = 50% · 10/40 = 25% · 17/40 = 43%
    expect(screen.getByText("40 · 100%")).toBeInTheDocument();
    expect(screen.getByText("26 · 65%")).toBeInTheDocument();
    expect(screen.getByText("20 · 50%")).toBeInTheDocument();
    expect(screen.getByText("10 · 25%")).toBeInTheDocument();
    expect(screen.getByText("17 · 43%")).toBeInTheDocument();
  });

  it("הנשירה בין שלבים היא ההפרש מהשלב הקודם, לא מהסך-הכול", () => {
    render(<AdminOverview />);
    // 40→26 נושרים 14 · 26→20 נושרים 6 · 20→10 נושרים 10 · 10→17 עולה, אין נשירה
    const drops = screen.getAllByText(/נשרו/).map((e) => e.textContent ?? "");
    const joined = drops.join(" | ");
    expect(joined).toContain("14");
    expect(joined).toContain("6");
    expect(joined).toContain("10");
  });

  it("השלב הראשון לעולם בלי שורת נשירה — אין ממה לנשור", () => {
    render(<AdminOverview />);
    expect(screen.getByText("חשבון קיים").textContent).not.toMatch(/נשרו/);
  });
});

describe("לוח הבקרה — המספרים שאריאל פתח בשבילם", () => {
  it("ארבעת ה-KPI מציגים את הספירות כלשונן", () => {
    render(<AdminOverview />);
    expect(screen.getByText("משתמשים רשומים")).toBeInTheDocument();
    expect(screen.getByText("נרשמו ב-24 השעות")).toBeInTheDocument();
    expect(screen.getByText(/מהם 2 מנהלים/)).toBeInTheDocument();
    expect(screen.getByText(/109 מהן עם ציון/)).toBeInTheDocument();
  });

  it("הקורסים המבוקשים מדורגים לפי כמות המתכננים", () => {
    render(<AdminOverview />);
    expect(screen.getByText("חקיקה ורגולציה")).toBeInTheDocument();
    expect(screen.getByText("1411-9107")).toBeInTheDocument();
  });

  it("שנת פתיחה ריקה נקראת 'עוד לא הצהירו', לא 'null'", () => {
    render(<AdminOverview />);
    expect(screen.getByText("עוד לא הצהירו")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("תחום מיקוד ריק נקרא 'עוד לא בחרו'", () => {
    render(<AdminOverview />);
    expect(screen.getAllByText("עוד לא בחרו").length).toBeGreaterThan(0);
  });
});
