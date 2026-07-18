// @vitest-environment jsdom
// =========================================================================
// Locks the shortfall/overload HONESTY contract of the planner InsightsBar
// (#41 QA-5). The load label + the workload/schedule narrative must never cry
// "overload"/"heavy" on a genuinely light or empty plan — that state stays
// calm ("קל") — and must surface REAL pain only when the inputs justify it:
//   • 3+ hard courses            → "N קורסים קשים באותו סמסטר …"
//   • a seminar + 2 hard courses → "סמינריון + 2 קורסים קשים … מאתגר במיוחד"
//   • ≥ 20 ש״ס                    → honest-load label flips to "עומס ש״ס"
//   • > 16 ש״ס                    → tip warns "עומס גבוה …"
//   • ≥ 22 weekly contact hours  → honest-load label flips to "שבוע עמוס שעות"
// calculateHonestLoad / generateWorkloadExplanation / generateScheduleInsights
// all run for real here — only next-intl is mocked.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
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
    <InsightsBar
      selectedCourses={selected}
      allCourses={selected}
      totalCreditsPlanned={30}
      conflicts={[]}
    />,
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
    expect(screen.getByText(/סמסטר מאוזן/)).toBeInTheDocument();
    expectNoOverloadNarrative();
  });

  it("3+ hard courses → the tip surfaces the real pain", () => {
    const hard = [
      course({ id: "H1", credits: 3, difficultyLevel: "hard" }),
      course({ id: "H2", credits: 3, difficultyLevel: "hard" }),
      course({ id: "H3", credits: 3, difficultyLevel: "very_hard" }),
    ];
    renderBar(hard);
    expect(screen.getByText(/קורסים קשים באותו סמסטר/)).toBeInTheDocument();
  });

  it("seminar + 2 hard → the 'especially challenging' warning fires", () => {
    const plan = [
      course({ id: "SEM", credits: 4, courseType: "SEMINAR" }),
      course({ id: "H1", credits: 3, difficultyLevel: "hard" }),
      course({ id: "H2", credits: 3, difficultyLevel: "hard" }),
    ];
    renderBar(plan);
    expect(screen.getByText(/מאתגר במיוחד/)).toBeInTheDocument();
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

  it("> 16 ש״ס (no hard courses) → the tip still warns of high load", () => {
    // 6 courses × 3 ש״ס = 18; no difficultyLevel so the 'balanced' calm branch
    // is skipped and avg ש״ס ≤ 3.5 → the honest 'עומס גבוה' tip fires.
    const many = Array.from({ length: 6 }, (_, i) =>
      course({ id: `M${i}`, credits: 3, sessions: [{ dayOfWeek: "SUNDAY", startTime: "10:00", endTime: "11:00" }] }),
    );
    renderBar(many);
    expect(screen.getByText(/עומס גבוה/)).toBeInTheDocument();
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
