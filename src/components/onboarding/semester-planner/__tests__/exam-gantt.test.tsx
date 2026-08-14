// @vitest-environment jsdom
// =========================================================================
// #21 — "תוודא את הקטע הזה של גאנט תכנון מבחנים כי אני זוכר שפעם קודמת זה לא
// הלך כל כך טוב."
//
// The exam gantt shipped with no test at all, and four separate ways to lie:
//
//   1. Its "is this exam still ahead?" test compared a DATE-ONLY value stored
//      at UTC midnight (= 02:00/03:00 in Israel) against the current INSTANT.
//      So from ~03:01 on the morning of an exam the row silently VANISHED from
//      the timeline — on the single day a student most needs to see it.
//   2. It ignored submissionType entirely, so a PAPER/REFERAT course carrying
//      a stale catalog date drew a full exam bar for an exam that doesn't exist.
//   3. Conflicts and tight gaps only ever read מועד א׳. The most common shape of
//      an exam period — א׳ already sat, ב׳ still ahead — has no מועד א׳ left, so
//      those rows rendered but could never raise a warning, and two ב׳ sittings
//      on the same day were never flagged.
//   4. One sentence covered four different causes of an empty timeline, so
//      "the university hasn't published the timetable" read as the student's
//      own fault.
//
// Every date below is written the way the catalog actually stores it — UTC
// midnight — because that is what made #1 invisible to a local-midnight test.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

import { ExamGantt, focusScrollOffset } from "@/components/onboarding/semester-planner/exam-gantt";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// jsdom has no matchMedia; the component uses it for the phone breakpoint.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

/** A date-only value exactly as the catalog stores it: UTC midnight. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// 14.8.2026, 09:30 in Israel — i.e. 06:30 UTC. Deliberately AFTER the UTC
// midnight of "today", which is what used to erase today's exam.
const NOW = new Date(2026, 7, 14, 9, 30, 0);

function course(o: {
  code: string;
  name: string;
  submissionType?: string | null;
  examDateA?: Date | null;
  examDateB?: Date | null;
}): CourseWithSchedule {
  return {
    id: o.code,
    code: o.code,
    nameHe: o.name,
    nameEn: o.name,
    credits: 4,
    discipline: "ECONOMICS",
    courseType: "ELECTIVE",
    isMandatory: false,
    submissionType: o.submissionType === undefined ? "EXAM" : o.submissionType,
    examDateA: o.examDateA ?? null,
    examDateB: o.examDateB ?? null,
    scheduleSessions: [],
  } as unknown as CourseWithSchedule;
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.1 — an exam TODAY is still ahead of you", () => {
  it("keeps the row on the exam's own morning (the vanishing-row bug)", () => {
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 14) })]} />);
    // The row itself…
    expect(screen.getByText("מיקרו")).toBeInTheDocument();
    // …and its מועד א׳ marker, dated to today and not to yesterday.
    expect(screen.getByTitle(/מועד א׳: .*14/)).toBeInTheDocument();
    // The old code compared the stored UTC-midnight value to Date.now() and
    // dropped it, leaving the whole timeline empty.
    expect(screen.queryByText(/כבר עברו/)).not.toBeInTheDocument();
  });

  it("still drops a sitting that is genuinely yesterday", () => {
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 13) })]} />);
    expect(screen.queryByText("מיקרו")).not.toBeInTheDocument();
    expect(screen.getByText(/כל מועדי הבחינה של הקורסים שבחרתם כבר עברו/)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.2 — a course with no exam draws no exam bar", () => {
  const dated = (submissionType: string | null) =>
    course({ code: "1011-1111", name: "סמינר", submissionType, examDateA: utc(2026, 8, 20) });

  it("a PAPER course with a stale catalog date is not drawn", () => {
    render(<ExamGantt now={NOW} courses={[dated("PAPER")]} />);
    expect(screen.queryByText("סמינר")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/מועד א׳/)).not.toBeInTheDocument();
  });

  it("REFERAT and NONE are dropped the same way", () => {
    for (const t of ["REFERAT", "NONE"]) {
      cleanup();
      render(<ExamGantt now={NOW} courses={[dated(t)]} />);
      expect(screen.queryByText("סמינר")).not.toBeInTheDocument();
    }
  });

  it("the SAME date on an EXAM course still draws — the filter is the type, not the date", () => {
    render(<ExamGantt now={NOW} courses={[dated("EXAM")]} />);
    expect(screen.getByText("סמינר")).toBeInTheDocument();
    expect(screen.getByTitle(/מועד א׳/)).toBeInTheDocument();
  });

  it("an unknown submissionType is still drawn — never hide a course on a guess", () => {
    render(<ExamGantt now={NOW} courses={[dated(null)]} />);
    expect(screen.getByText("סמינר")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.3 — מועד ב׳ can raise a warning", () => {
  // THE common shape: מועד א׳ of both courses was sat two weeks ago, and both
  // ב׳ sittings landed on the same day. moedA is null for both, so the old
  // א׳-only detector saw nothing at all.
  const bothOnTheSameB = [
    course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 3), examDateB: utc(2026, 8, 20) }),
    course({ code: "0618-2222", name: "לוגיקה", examDateA: utc(2026, 8, 5), examDateB: utc(2026, 8, 20) }),
  ];

  it("two מועד ב׳ sittings on the same day are flagged as a conflict", () => {
    render(<ExamGantt now={NOW} courses={bothOnTheSameB} />);
    expect(screen.getByText("מיקרו")).toBeInTheDocument();
    expect(screen.getByText("לוגיקה")).toBeInTheDocument();
    // Badge + legend both say it.
    expect(screen.getAllByText("התנגשות").length).toBeGreaterThan(0);
    // And the marker that clashes names the reason, on both rows.
    expect(screen.getAllByTitle(/מועד ב׳.*התנגשות/)).toHaveLength(2);
  });

  it("a same-day clash is ONE fact — a conflict, not also a 'tight gap'", () => {
    render(<ExamGantt now={NOW} courses={bothOnTheSameB} />);
    expect(screen.queryByText(/בפער של פחות משלושה ימים/)).not.toBeInTheDocument();
    expect(screen.queryByText("צפוף")).not.toBeInTheDocument();
  });

  it("two מועד ב׳ sittings two days apart raise the tight-gap warning", () => {
    render(
      <ExamGantt
        now={NOW}
        courses={[
          course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 3), examDateB: utc(2026, 8, 20) }),
          course({ code: "0618-2222", name: "לוגיקה", examDateA: utc(2026, 8, 5), examDateB: utc(2026, 8, 22) }),
        ]}
      />,
    );
    expect(screen.getByText("צפוף")).toBeInTheDocument();
    expect(screen.getByText(/זוג מבחנים אחד בפער של פחות משלושה ימים/)).toBeInTheDocument();
  });

  it("a course's OWN א׳→ב׳ pair is one exam, never a clash with itself", () => {
    render(
      <ExamGantt
        now={NOW}
        courses={[course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 20), examDateB: utc(2026, 8, 21) })]}
      />,
    );
    expect(screen.queryByText("התנגשות")).not.toBeInTheDocument();
    expect(screen.queryByText(/בפער של פחות משלושה ימים/)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.4 — an empty timeline says WHICH of the four causes it is", () => {
  const messageFor = (courses: CourseWithSchedule[]) => {
    cleanup();
    render(<ExamGantt now={NOW} courses={courses} />);
  };

  it("no courses picked", () => {
    messageFor([]);
    expect(screen.getByText(/עדיין לא בחרתם קורסים לסמסטר הזה/)).toBeInTheDocument();
  });

  it("courses picked, but none is assessed by an exam", () => {
    messageFor([course({ code: "1011-1111", name: "סמינר", submissionType: "PAPER", examDateA: utc(2026, 8, 20) })]);
    expect(screen.getByText(/אף קורס שבחרתם לא נבחן בבחינה/)).toBeInTheDocument();
  });

  it("exam courses, but the timetable was never published — and it says so is not their fault", () => {
    messageFor([course({ code: "1011-1111", name: "מיקרו" })]);
    expect(screen.getByText(/האוניברסיטה טרם פרסמה את הלוח/)).toBeInTheDocument();
    // The iron rule, restated where a student can read it.
    expect(screen.getByText(/לא נמציא תאריכים/)).toBeInTheDocument();
  });

  it("dates existed and all of them passed", () => {
    messageFor([course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 7, 2), examDateB: utc(2026, 7, 20) })]);
    expect(screen.getByText(/כל מועדי הבחינה של הקורסים שבחרתם כבר עברו/)).toBeInTheDocument();
  });

  it("the four causes produce four DIFFERENT sentences", () => {
    const seen = new Set<string>();
    const fixtures: CourseWithSchedule[][] = [
      [],
      [course({ code: "1011-1111", name: "סמינר", submissionType: "PAPER", examDateA: utc(2026, 8, 20) })],
      [course({ code: "1011-1111", name: "מיקרו" })],
      [course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 7, 2) })],
    ];
    for (const f of fixtures) {
      cleanup();
      const { container } = render(<ExamGantt now={NOW} courses={f} />);
      seen.add(container.textContent ?? "");
    }
    expect(seen.size).toBe(4);
    // And the old catch-all line is gone for good.
    for (const text of seen) expect(text).not.toContain("אין מועדי בחינה לקורסים שנבחרו");
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.5 — the auto-scroll does not park the focus column under the label", () => {
  // Phone tokens: an 88px sticky label over 30px columns.
  const LABEL = 88;
  const DAY = 30;
  const columnLeft = (focusCol: number) => LABEL + focusCol * DAY - focusScrollOffset(focusCol, DAY);

  it("leaves the focus column two full columns clear of the sticky label", () => {
    // The old formula added labelWidth — which a `position: sticky` column does
    // NOT consume — landing the column at 60px under an 88px label (~93% covered).
    expect(columnLeft(12)).toBe(LABEL + 2 * DAY);
    expect(columnLeft(12)).toBeGreaterThanOrEqual(LABEL);
  });

  it("never scrolls to a negative offset near the start of the timeline", () => {
    expect(focusScrollOffset(0, DAY)).toBe(0);
    expect(focusScrollOffset(1, DAY)).toBe(0);
    expect(focusScrollOffset(2, DAY)).toBe(0);
    expect(focusScrollOffset(3, DAY)).toBe(DAY);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.6 — the month is on screen, not only in a desktop tooltip", () => {
  it("names the month above the day numbers", () => {
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 20) })]} />);
    expect(screen.getByText("אוג׳")).toBeInTheDocument();
  });

  it("a range that crosses a month names BOTH — '…29 30 1 2 3…' is not a date", () => {
    render(
      <ExamGantt
        now={new Date(2026, 6, 20, 9, 0, 0)}
        courses={[
          course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 7, 30) }),
          course({ code: "0618-2222", name: "לוגיקה", examDateA: utc(2026, 8, 3) }),
        ]}
      />,
    );
    expect(screen.getByText("יולי")).toBeInTheDocument();
    expect(screen.getByText("אוג׳")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("#21.7 — what the student told /exam-planner holds here too", () => {
  it("a date they typed for an undated course shows up, labelled as theirs", () => {
    localStorage.setItem("pk-manual-exam-dates", JSON.stringify({ "1011-1111": "2026-08-25" }));
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "מיקרו" })]} />);
    expect(screen.getByText("מיקרו")).toBeInTheDocument();
    // Never let a student's own date pass for a published one.
    expect(screen.getByTitle(/תאריך שהזנתם/)).toBeInTheDocument();
  });

  it("a published catalog date always beats the typed one", () => {
    localStorage.setItem("pk-manual-exam-dates", JSON.stringify({ "1011-1111": "2026-08-25" }));
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 20) })]} />);
    expect(screen.queryByTitle(/תאריך שהזנתם/)).not.toBeInTheDocument();
    expect(screen.getByTitle(/מועד א׳: .*20/)).toBeInTheDocument();
  });

  it("a course they marked 'עבודה במקום מבחן' leaves the timeline", () => {
    localStorage.setItem("pk-alt-assessment", JSON.stringify(["1011-1111"]));
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "סמינר", examDateA: utc(2026, 8, 20) })]} />);
    expect(screen.queryByText("סמינר")).not.toBeInTheDocument();
    expect(screen.getByText(/אף קורס שבחרתם לא נבחן בבחינה/)).toBeInTheDocument();
  });

  it("corrupt localStorage degrades to the catalog instead of blanking the screen", () => {
    localStorage.setItem("pk-manual-exam-dates", "{not json");
    localStorage.setItem("pk-alt-assessment", "{not json");
    render(<ExamGantt now={NOW} courses={[course({ code: "1011-1111", name: "מיקרו", examDateA: utc(2026, 8, 20) })]} />);
    expect(screen.getByText("מיקרו")).toBeInTheDocument();
  });
});
