// @vitest-environment jsdom
// =========================================================================
// "התקדמות בתואר" — ש״ס שנצבר נספר פעם אחת, לא פעמיים
// =========================================================================
// אריאל, 5.9: *"מרגיש לי שההתקדמות בתואר בחלון הזה של ה-123/150 לא מדויקת."*
//
// הכרטיס קיבל שני מספרים: `completedCredits` (שורות התיק) ו-
// `totalCreditsPlanned` — שהיה **הסך-הכול** של התוכנית, כלומר כבר הכיל את
// מה שנצבר. הוא הציג את סכומם. אצל אריאל: 52 + 71 = 123 במקום 77.
//
// עכשיו שני הפרופס הם שני חצאים זרים של אותו שלם, והבדיקה הזאת מקבעת שהם
// מסתכמים בדיוק — ושהפיצול שכתוב מתחת לכותרת מסכים איתה.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InsightsBar } from "../insights-bar";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) =>
    ({
      degreeProgress: "התקדמות בתואר",
      creditsThisSemester: "ש״ס בסמסטר",
      conflicts: "התנגשויות",
      loadLevel: "רמת עומס",
      nz: "ש״ס",
    })[k] ?? k,
  useLocale: () => "he",
}));

vi.mock("@/lib/trpc/react", () => ({
  api: {
    courseKnowledge: { getForCourses: { useQuery: () => ({ data: undefined }) } },
  },
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("כרטיס ההתקדמות בתואר", () => {
  const base = {
    selectedCourses: [],
    conflicts: [],
    unscheduledCount: 0,
  };

  it("מציג נצבר + מתוכנן, לא נצבר + סך-הכול", () => {
    render(
      // 52 שנצברו + 25 שמתוכננים = 77. הבאג הישן היה מראה 123.
      <InsightsBar {...base} completedCredits={52} totalCreditsPlanned={25} />,
    );
    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.queryByText("123")).not.toBeInTheDocument();
  });

  it("הפיצול מתחת לכותרת מסתכם בדיוק לכותרת", () => {
    render(<InsightsBar {...base} completedCredits={39} totalCreditsPlanned={21} />);
    expect(screen.getByText("60")).toBeInTheDocument();
    // "39 שכבר עשיתם · 21 בתכנון"
    expect(screen.getByText(/שכבר עשיתם/)).toBeInTheDocument();
  });

  it("סטודנט בלי היסטוריה רואה בדיוק את מה שתכנן", () => {
    render(<InsightsBar {...base} completedCredits={0} totalCreditsPlanned={11} />);
    expect(screen.getByText("11")).toBeInTheDocument();
  });
});
