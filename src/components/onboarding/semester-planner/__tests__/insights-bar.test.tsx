// @vitest-environment jsdom
// =========================================================================
// Locks the shortfall/overload HONESTY contract of the planner InsightsBar
// (#41 QA-5). The load label + the schedule narrative must never cry
// "overload"/"heavy" on a genuinely light or empty plan — that state stays
// calm ("קל") — and must surface REAL pain only when the inputs justify it:
//   • 2+ hard courses            → the insight names them
//   • ≥ 20 ש״ס                    → honest-load label flips to "עומס ש״ס"
//   • ≥ 22 weekly contact hours  → honest-load label flips to "שבוע עמוס שעות"
//
// CHANGED 13.8 — the "> 16 ש״ס → 'עומס גבוה'" assertion below was REMOVED, and
// with it the whole `generateWorkloadExplanation` narrative. It was regression-
// protecting a self-contradiction: `calculateHonestLoad` calls a semester קל
// until 20 ש״ס, while that tip shouted "עומס גבוה — וודאו שאתם מסוגלים
// להתמודד" from 17. At 17–19 ש״ס both rendered on the same card, thirty pixels
// apart. Ariel's screenshot (19 ש״ס, chip reading "קל") is exactly that state,
// and his note on it was "רמת עומס וכל המדדים האלו - אתה חותם עליהם?" — no.
// Not one of that tip's thresholds (>16 ש״ס, avg > 3.5, 80% mandatory) had a
// source, which the project's own iron rule forbids. The card now carries the
// honest-load label, ITS two real numbers, and the schedule insights.
// calculateHonestLoad / generateScheduleInsights run for real here — only
// next-intl is mocked.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

// The hard-course insights read difficultyLevel, which is gated behind
// ARAZIM_ENABLED ("בלי ארזים כרגע"). These tests lock the difficulty-messaging
// logic, so they run with the Arazim-enabled path.
vi.mock("@/lib/arazim/visibility", async (orig) => ({
  ...(await orig<typeof import("@/lib/arazim/visibility")>()),
  ARAZIM_ENABLED: true,
}));

import { InsightsBar } from "@/components/onboarding/semester-planner/insights-bar";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// ── Fixture factory — a minimal, controlled CourseWithSchedule ───────────
interface Sess {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}
interface CourseOverrides {
  id: string;
  credits: number;
  difficultyLevel?: string | null;
  courseType?: string;
  isMandatory?: boolean;
  discipline?: string;
  nameHe?: string;
  sessions?: Sess[];
  examDateA?: Date | string | null;
}
function course(o: CourseOverrides): CourseWithSchedule {
  return {
    id: o.id,
    code: o.id,
    nameHe: o.nameHe ?? o.id,
    nameEn: o.nameHe ?? o.id,
    credits: o.credits,
    difficultyLevel: o.difficultyLevel ?? null,
    courseType: o.courseType ?? "ELECTIVE",
    isMandatory: o.isMandatory ?? false,
    discipline: o.discipline ?? "ECONOMICS",
    examDateA: o.examDateA ?? null,
    scheduleSessions: (o.sessions ?? []).map((s) => ({
      ...s,
      sessionType: "LECTURE",
    })),
  } as unknown as CourseWithSchedule;
}

function renderBar(selected: CourseWithSchedule[]) {
  return render(
    <InsightsBar selectedCourses={selected} totalCreditsPlanned={30} conflicts={[]} />,
  );
}

// The four honest-load pain labels (LEVEL_LABELS_HE). Only the calm "קל" may
// appear on a light plan; the heavy three must be absent.
const HEAVY_LABELS = ["שבוע עמוס שעות", "עומס ש״ס", "מבחנים צפופים"];

function expectNoOverloadNarrative() {
  for (const label of HEAVY_LABELS) {
    expect(screen.queryByText(label)).toBeNull();
  }
  // The "high load" workload tip and dense-day / hard-course warnings must not
  // fire. ("עומס קל" / "אין קורסים קשים" are CALM copy and must NOT trip this.)
  const body = document.body.textContent ?? "";
  expect(body).not.toMatch(/עומס גבוה/);
  expect(body).not.toMatch(/באותו סמסטר/);
  expect(body).not.toMatch(/מאתגר במיוחד/);
  expect(body).not.toMatch(/צפוף/);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("InsightsBar — shortfall/overload honesty (#41 QA-5)", () => {
  it("empty plan is the calm state — 'קל', zero overload narrative", () => {
    renderBar([]);
    expect(screen.getByText("קל")).toBeInTheDocument();
    expectNoOverloadNarrative();
  });

  it("light plan (0 hard, low ש״ס, short weeks) stays calm — never warns", () => {
    // 3 easy courses, 6 ש״ס, 2h each on separate days → 6 weekly hrs, no exams.
    const light = [
      course({ id: "A", credits: 2, difficultyLevel: "easy", sessions: [{ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "12:00" }] }),
      course({ id: "B", credits: 2, difficultyLevel: "easy", sessions: [{ dayOfWeek: "MONDAY", startTime: "10:00", endTime: "12:00" }] }),
      course({ id: "C", credits: 2, difficultyLevel: "easy", sessions: [{ dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "12:00" }] }),
    ];
    renderBar(light);
    // Honest-load label is the calm one.
    expect(screen.getByText("קל")).toBeInTheDocument();
    // The narrative names the calm reality, not a false alarm.
    expect(screen.getByText(/מיקס טוב/)).toBeInTheDocument();
    expectNoOverloadNarrative();
  });

  it("3+ hard courses → the insight NAMES them, instead of a verdict word", () => {
    const hard = [
      course({ id: "H1", credits: 3, difficultyLevel: "hard", nameHe: "כלכלה" }),
      course({ id: "H2", credits: 3, difficultyLevel: "hard", nameHe: "לוגיקה" }),
      course({ id: "H3", credits: 3, difficultyLevel: "very_hard", nameHe: "סטטיסטיקה" }),
    ];
    renderBar(hard);
    // generateScheduleInsights lists the actual course names — a fact the
    // student can check — where the deleted tip only asserted "3 קורסים קשים".
    expect(screen.getByText(/קורסים קשים: /)).toBeInTheDocument();
    expect(screen.getByText(/כלכלה/)).toBeInTheDocument();
  });

  it("≥ 20 ש״ס → the honest-load label flips to the credit-heavy pain", () => {
    // 5 courses × 4 ש״ס = 20; short sessions, no exams → 'credits' label.
    const heavy = Array.from({ length: 5 }, (_, i) =>
      course({ id: `C${i}`, credits: 4, sessions: [{ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "11:00" }] }),
    );
    renderBar(heavy);
    expect(screen.getByText("עומס ש״ס")).toBeInTheDocument();
    // No longer calm.
    expect(screen.queryByText("קל")).toBeNull();
  });

  it("18 ש״ס → ONE verdict on the card, not two contradicting ones", () => {
    // 6 courses × 3 ש״ס = 18. This is the exact state from Ariel's screenshot.
    // The card used to render the chip "קל" (calculateHonestLoad: < 20 ש״ס) and
    // the sentence "עומס גבוה — וודאו שאתם מסוגלים להתמודד" (the deleted tip:
    // > 16 ש״ס) one under the other. Whatever the right threshold is, it cannot
    // be both — and the tip's was unsourced, so the tip went.
    const many = Array.from({ length: 6 }, (_, i) =>
      course({ id: `M${i}`, credits: 3, sessions: [{ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "11:00" }] }),
    );
    renderBar(many);
    expect(screen.getByText("קל")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/עומס גבוה/);
    // The verdict word is attributed to us, not presented as a fact about TAU.
    expect(screen.getByText(/לפי הספים שלנו/)).toBeInTheDocument();
    // The two numbers behind it are still on screen, unchanged.
    expect(screen.getByText(/שעות לימוד בשבוע/)).toBeInTheDocument();
  });

  it("≥ 22 weekly contact hours → the honest-load label flips to 'heavy week'", () => {
    // 4 courses, one 6h block each on a distinct day → 24 weekly hrs.
    const marathon = [
      course({ id: "W1", credits: 3, sessions: [{ dayOfWeek: "SUNDAY", startTime: "08:00", endTime: "14:00" }] }),
      course({ id: "W2", credits: 3, sessions: [{ dayOfWeek: "MONDAY", startTime: "08:00", endTime: "14:00" }] }),
      course({ id: "W3", credits: 3, sessions: [{ dayOfWeek: "TUESDAY", startTime: "08:00", endTime: "14:00" }] }),
      course({ id: "W4", credits: 3, sessions: [{ dayOfWeek: "WEDNESDAY", startTime: "08:00", endTime: "14:00" }] }),
    ];
    renderBar(marathon);
    expect(screen.getByText("שבוע עמוס שעות")).toBeInTheDocument();
    expect(screen.queryByText("קל")).toBeNull();
  });
});
