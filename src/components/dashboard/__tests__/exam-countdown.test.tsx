// @vitest-environment jsdom
// =========================================================================
// The dashboard exam countdown, at the hour it used to lie
// =========================================================================
// Reported: the card listed YESTERDAY's exam with the pulsing "היום" badge.
// Cause: it bucketed "today" by the browser Date's UTC COMPONENTS while an exam
// date is a date-only value at UTC midnight — so between 00:00 and 02:00/03:00
// Israel time (21:00/22:00 UTC the evening before) the card was a whole day
// behind the student it belongs to.
//
// Every instant below is written as an EXPLICIT UTC offset with the Israeli
// wall-clock time it corresponds to. This is deliberate: vitest.config.ts pins
// TZ=Asia/Jerusalem, which hides server-local bugs — and this particular bug is
// not host-dependent at all (it lives in the UTC/Israel disagreement), so the
// cases must be stated as instants, and they must hold in ANY host zone. The
// last test re-runs the whole set under TZ=UTC to prove exactly that.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({ exams: [] as unknown[] }));

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/trpc/react", () => ({
  api: {
    schedule: {
      getExamSchedule: { useQuery: () => ({ data: { exams: h.exams }, isLoading: false }) },
    },
  },
}));

import { ExamCountdown } from "@/components/dashboard/exam-countdown";

/** An exam date as the DB stores it: date-only, UTC midnight. */
const examOn = (iso: string) => new Date(`${iso}T00:00:00Z`);
const exam = (courseName: string, a: string | null, b: string | null = null) => ({
  courseCode: `0000-${courseName.length}`,
  courseName,
  examDateA: a ? examOn(a) : null,
  examDateB: b ? examOn(b) : null,
});

/** Run a body with the host zone forced — Node honours a runtime TZ change. */
function withTZ(zone: string, body: () => void) {
  const prev = process.env.TZ;
  process.env.TZ = zone;
  try {
    body();
  } finally {
    process.env.TZ = prev;
  }
}

const text = (c: HTMLElement) => c.textContent ?? "";
/** The big number in each row's counter tile, in render order. */
const dayCounters = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(".font-mono > span:first-child")).map((n) =>
    n.textContent?.trim(),
  );

beforeEach(() => {
  cleanup();
  h.exams = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** 2026-08-14T21:30Z — 00:30 on FRIDAY 15.8 in Israel (IDT, UTC+3). */
const JUST_AFTER_IL_MIDNIGHT = new Date("2026-08-14T21:30:00Z");

function assertCorrectAtIsraeliMidnight() {
  vi.setSystemTime(JUST_AFTER_IL_MIDNIGHT);
  h.exams = [
    exam("אתמול", "2026-08-14"), // yesterday for the student
    exam("היום-שלי", "2026-08-15"), // TODAY for the student
    exam("מחר", "2026-08-16"),
  ];
  const { container } = render(<ExamCountdown />);
  const rendered = text(container);

  // Yesterday's exam is gone — it must never wear the "היום" badge.
  expect(rendered).not.toContain("אתמול");
  // Today's exam is today: 0 days.
  expect(rendered).toContain("היום-שלי");
  expect(rendered).toContain("היום");
  // …and the counters are 0 and 1, not 1 and 2.
  expect(dayCounters(container)).toEqual(["0", "1"]);
}

describe("ExamCountdown — civil days, not UTC components", () => {
  it("at 00:30 Israel it counts the STUDENT's day, not the server's", () => {
    assertCorrectAtIsraeliMidnight();
  });

  it("gives the same answer with the host clock in UTC (production)", () => {
    withTZ("UTC", assertCorrectAtIsraeliMidnight);
  });

  it("gives the same answer for a student abroad (UTC-negative host)", () => {
    withTZ("America/New_York", assertCorrectAtIsraeliMidnight);
  });

  it("mid-afternoon Israel behaves identically — the fix is not a time-of-day hack", () => {
    // 2026-08-15T12:00Z = 15:00 Israel on the 15th.
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
    h.exams = [exam("היום-שלי", "2026-08-15"), exam("בעוד-שבוע", "2026-08-22")];
    const { container } = render(<ExamCountdown />);
    expect(dayCounters(container)).toEqual(["0", "7"]);
  });

  it("renders nothing when every sitting is behind the student", () => {
    vi.setSystemTime(JUST_AFTER_IL_MIDNIGHT);
    h.exams = [exam("אתמול", "2026-08-14"), exam("שלשום", "2026-08-13", "2026-08-01")];
    const { container } = render(<ExamCountdown />);
    expect(container).toBeEmptyDOMElement();
  });
});
