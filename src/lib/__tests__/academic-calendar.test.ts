import { describe, it, expect } from "vitest";
import {
  getAcademicNow,
  getPlanningAnchor,
  deriveYearOfStudy,
  hebrewYearLabel,
  getTeachingRange,
  describeAcademicNow,
  TAU_CALENDARS,
} from "@/lib/academic-calendar";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe("getAcademicNow — attribution + phase (dates verified vs tau.ac.il/calendar)", () => {
  it("before the first calendar → pinned to first FALL, stale", () => {
    // The table now starts at תשפ"ד (war year, teaching from 31.12.23 — the
    // official revised calendar), so "before everything" means autumn 2023:
    // the war-delay months with no teaching to attribute to.
    const a = getAcademicNow(at(2023, 11, 15));
    expect(a.semester).toBe("FALL");
    expect(a.isStale).toBe(true);
  });

  it("25.10.25 — the day before תשפ\"ו fall — belongs to תשפ\"ה SPRING's tail, not limbo", () => {
    const a = getAcademicNow(at(2025, 10, 25));
    expect(a.startYear).toBe(2024);
    expect(a.semester).toBe("SPRING");
  });

  it("war-year attribution: February 2024 is תשפ\"ד FALL *teaching* (the revised calendar)", () => {
    // Under a guessed 'normal' calendar this date would read as exams/spring —
    // the whole reason these dates had to come from the official source.
    const a = getAcademicNow(at(2024, 2, 15));
    expect(a.startYear).toBe(2023);
    expect(a.semester).toBe("FALL");
    expect(a.phase).toBe("teaching");
  });

  it("26.10.25 — first day of תשפ\"ו fall teaching", () => {
    const a = getAcademicNow(at(2025, 10, 26));
    expect(a).toMatchObject({ startYear: 2025, semester: "FALL", phase: "teaching", isStale: false });
  });

  it("26.1.26 — day after fall teaching ends → exams (prep day)", () => {
    expect(getAcademicNow(at(2026, 1, 26)).phase).toBe("exams");
  });

  it("13.3.26 — last published fall exam day → exams", () => {
    expect(getAcademicNow(at(2026, 3, 13)).phase).toBe("exams");
  });

  it("14.3.26 — after fall exams → break, still attributed to FALL", () => {
    const a = getAcademicNow(at(2026, 3, 14));
    expect(a.semester).toBe("FALL");
    expect(a.phase).toBe("break");
  });

  it("12.4.26 — spring teaching starts", () => {
    expect(getAcademicNow(at(2026, 4, 12))).toMatchObject({ semester: "SPRING", phase: "teaching" });
  });

  it("7.7.26 — THE substantive fix: still teaching (old code thought exams)", () => {
    const a = getAcademicNow(at(2026, 7, 7));
    expect(a).toMatchObject({ startYear: 2025, semester: "SPRING", phase: "teaching" });
  });

  it("12.7.26 — spring exams start", () => {
    expect(getAcademicNow(at(2026, 7, 12)).phase).toBe("exams");
  });

  it("late September (past ~6 exam weeks) → honest break, not eternal exams", () => {
    const a = getAcademicNow(at(2026, 9, 25));
    expect(a.phase).toBe("break");
    expect(a.nextTeachingStart!.getTime()).toBe(at(2026, 10, 18).setHours(0, 0, 0, 0));
  });

  it("17.10.26 — still תשפ\"ו SPRING window; 18.10.26 — תשפ\"ז FALL", () => {
    expect(getAcademicNow(at(2026, 10, 17)).startYear).toBe(2025);
    const b = getAcademicNow(at(2026, 10, 18));
    expect(b).toMatchObject({ startYear: 2026, semester: "FALL", phase: "teaching" });
  });

  it("1.7.27 — תשפ\"ז spring exams", () => {
    const a = getAcademicNow(at(2027, 7, 1));
    expect(a).toMatchObject({ startYear: 2026, semester: "SPRING", phase: "exams" });
  });

  it("1.12.27 — past all calendars → stale", () => {
    expect(getAcademicNow(at(2027, 12, 1)).isStale).toBe(true);
  });

  it("exposes the summer window (google-sync fallback needs it)", () => {
    const a = getAcademicNow(at(2026, 7, 7));
    expect(a.summer?.start.getMonth()).toBe(6); // July
  });
});

// #5/#39 — the onboarding used to print a phase GUESS ("באמצע תקופת הלימודים")
// and the exam planner said nothing at all, so the app read as date-blind.
// Every sentence below must name a REAL published date and never imply one that
// isn't published.
describe("describeAcademicNow — the app proves it knows what day it is", () => {
  it("mid-teaching names the semester, the year AND the day teaching ends", () => {
    const s = describeAcademicNow(at(2026, 5, 10)); // תשפ"ו spring teaching
    expect(s.phase).toBe("teaching");
    expect(s.semesterHe).toBe("סמסטר ב׳");
    expect(s.yearLabelHe).toBe("תשפ״ו");
    expect(s.he).toContain("10.7.26"); // the real teachingEnd, not a guess
    expect(s.he).toContain("סמסטר ב׳");
    expect(s.he).not.toContain("באמצע"); // the old hand-wave is gone
    expect(s.teachingDaysLeft).toBe(62);
  });

  it("the last teaching day says exactly that, not 'N days left'", () => {
    const s = describeAcademicNow(at(2026, 7, 10));
    expect(s.teachingDaysLeft).toBe(1);
    expect(s.he).toContain("יום הלימודים האחרון");
  });

  it("13.8.26 — Ariel's report: INSIDE the exam period, and the copy says so", () => {
    const s = describeAcademicNow(at(2026, 8, 13));
    expect(s.phase).toBe("exams");
    expect(s.he).toContain("תקופת המבחנים");
    expect(s.he).toContain("סמסטר ב׳");
    expect(s.he).toContain("10.7.26"); // teaching ended
    expect(s.he).toContain("12.7.26"); // exams began
  });

  it("an UNPUBLISHED exam-period end is stated as unpublished — never invented", () => {
    const spring = describeAcademicNow(at(2026, 8, 13)); // examEnd === null
    expect(spring.examEndPublished).toBe(false);
    expect(spring.he).toContain("טרם פורסם");

    const fall = describeAcademicNow(at(2026, 2, 10)); // תשפ"ו fall, examEnd 13.3.26
    expect(fall.examEndPublished).toBe(true);
    expect(fall.he).toContain("13.3.26");
    expect(fall.he).not.toContain("טרם פורסם");
  });

  it("between semesters it points at the next teaching start (a published date)", () => {
    const s = describeAcademicNow(at(2026, 3, 20)); // after תשפ"ו fall exams
    expect(s.phase).toBe("break");
    expect(s.he).toContain("בין הסמסטרים");
    expect(s.he).toContain("12.4.26");
  });

  it("summer break names next year's fall, with its own Hebrew year label", () => {
    const s = describeAcademicNow(at(2026, 9, 25));
    expect(s.he).toContain("חופשת הקיץ");
    expect(s.he).toContain("סמסטר א׳ של תשפ״ז");
    expect(s.he).toContain("18.10.26");
  });

  it("outside every verified calendar it refuses to describe the year at all", () => {
    const s = describeAcademicNow(at(2027, 12, 1));
    expect(s.isStale).toBe(true);
    expect(s.he).toContain("לא נציג ניחוש");
    expect(s.he).not.toMatch(/\d+\.\d+\.\d+/); // no date claimed
  });

  it("English mirrors Hebrew phase-for-phase", () => {
    expect(describeAcademicNow(at(2026, 8, 13)).en).toContain("exam period");
    expect(describeAcademicNow(at(2026, 5, 10)).en).toContain("Spring 2025/26");
  });
});

describe("getPlanningAnchor", () => {
  it("7.7.26 (still teaching) → the current SPRING", () => {
    expect(getPlanningAnchor(at(2026, 7, 7))).toEqual({ startYear: 2025, semester: "SPRING" });
  });

  it("13.7.26 (spring exams) → next FALL of תשפ\"ז", () => {
    expect(getPlanningAnchor(at(2026, 7, 13))).toEqual({ startYear: 2026, semester: "FALL" });
  });

  it("1.2.27 (fall exams) → SPRING of the same year", () => {
    expect(getPlanningAnchor(at(2027, 2, 1))).toEqual({ startYear: 2026, semester: "SPRING" });
  });
});

describe("deriveYearOfStudy", () => {
  it("startYear=2024 in 7.7.26 → year 2; in 18.10.26 → year 3", () => {
    expect(deriveYearOfStudy(2024, 1, undefined, at(2026, 7, 7))).toBe(2);
    expect(deriveYearOfStudy(2024, 1, undefined, at(2026, 10, 18))).toBe(3);
  });

  it("null anchor → stored fallback; clamped to 1..3 (PPE is a 3-year degree)", () => {
    expect(deriveYearOfStudy(null, 2)).toBe(2);
    expect(deriveYearOfStudy(2022, 1, undefined, at(2026, 7, 7))).toBe(3); // not 4/5
    expect(deriveYearOfStudy(2030, 1, undefined, at(2026, 7, 7))).toBe(1);
  });
});

describe("hebrewYearLabel", () => {
  it("known years get gershayim labels; unknown get a numeric fallback", () => {
    expect(hebrewYearLabel(2025)).toBe("תשפ״ו");
    expect(hebrewYearLabel(2031)).toBe("2031/32");
  });
});

describe("getTeachingRange (export regression — the corrected dates)", () => {
  it("SPRING during תשפ\"ו teaching = 12.4.26–10.7.26", () => {
    const r = getTeachingRange("SPRING", at(2026, 7, 7));
    expect(r.start.getTime()).toBe(at(2026, 4, 12).setHours(0, 0, 0, 0));
    expect(r.end.getTime()).toBe(at(2026, 7, 10).setHours(0, 0, 0, 0));
  });

  it("after spring ends → next year's spring", () => {
    const r = getTeachingRange("SPRING", at(2026, 8, 1));
    expect(r.start.getFullYear()).toBe(2027);
  });
});

// #13/#15 (12.7) — bidding always targets the NEXT teaching semester
import { getBiddingTarget, isBiddingSeason } from "@/lib/bidding-target";

describe("getBiddingTarget", () => {
  it("in July 2026 (post-spring) a year-1 student bids for FALL of year 2", () => {
    const t = getBiddingTarget(2025, 1, new Date(2026, 6, 12));
    expect(t).not.toBeNull();
    expect(t!.semester).toBe("FALL");
    expect(t!.yearOfStudy).toBe(2);
  });
  it("mid-fall teaching the target is SPRING of the same study year", () => {
    const t = getBiddingTarget(2025, 1, new Date(2025, 11, 1));
    expect(t!.semester).toBe("SPRING");
    expect(t!.yearOfStudy).toBe(1);
  });
  it("season flag flips within 45 days of the next teaching start", () => {
    const far = getBiddingTarget(2025, 1, new Date(2026, 6, 12)); // Oct 18 start → >90d
    expect(isBiddingSeason(far)).toBe(false);
    const near = getBiddingTarget(2025, 1, new Date(2026, 8, 20)); // <45d to Oct 18
    expect(isBiddingSeason(near)).toBe(true);
  });
});

// #10 (18:19) — time-adaptive focus selector
import { getTimeFocus } from "@/lib/time-focus";

describe("getTimeFocus", () => {
  const base = { startYear: 2025, storedYear: 1, daysToNearestExam: null, gradesPending: false };
  it("exams win when one is within 30 days", () => {
    const f = getTimeFocus({ ...base, daysToNearestExam: 5, now: new Date(2026, 6, 12) });
    expect(f?.kind).toBe("exams");
    expect(f?.href).toBe("/exam-planner");
    expect(f?.days).toBe(5);
  });
  it("grades-pending routes to the record scanner", () => {
    const f = getTimeFocus({ ...base, gradesPending: true, now: new Date(2026, 6, 12) });
    expect(f?.kind).toBe("grades");
    expect(f?.href).toBe("/record?scan=1");
  });
  it("exams outrank grades", () => {
    const f = getTimeFocus({ ...base, daysToNearestExam: 3, gradesPending: true, now: new Date(2026, 6, 12) });
    expect(f?.kind).toBe("exams");
  });
  it("mid-teaching with nothing urgent → your week", () => {
    const f = getTimeFocus({ ...base, now: new Date(2025, 11, 1) }); // fall teaching
    expect(f?.kind).toBe("teaching");
    expect(f?.href).toBe("/calendar");
  });
});

// ── never-invent-a-date (13.8) ──────────────────────────────────────────
// `nextTeachingStart` used to fall back to
// `new Date(SPRING.teachingStart.getFullYear() + 1, 9, 15)` once we ran past
// the last known calendar. For תשפ״ז SPRING that is 15.10.2028 — a year wrong
// and wholly made up — while `isStale` stayed false, so describeAcademicNow and
// the dashboard printed it to students as fact, and the King was handed it in
// its system prompt. Absence is now representable.
describe("nextTeachingStart is never invented", () => {
  it("is null past the last known calendar, not a guessed October date", () => {
    const far = getAcademicNow(new Date(2030, 5, 1));
    expect(far.nextTeachingStart).toBeNull();
  });

  it("never names a date outside the published calendars — swept month by month", () => {
    // The real guarantee. The old fallback produced a mid-October date one year
    // past the last SPRING, so it could surface as a plausible-looking start in
    // any month past the calendar's end. Nothing may name 2028+ or the
    // 15.10 shape, in either the structured field or the prose.
    const lastKnown = TAU_CALENDARS[TAU_CALENDARS.length - 1]!;
    for (let y = lastKnown.startYear + 1; y <= lastKnown.startYear + 4; y++) {
      for (let m = 0; m < 12; m++) {
        const at = new Date(y, m, 15);
        const a = getAcademicNow(at);
        if (a.nextTeachingStart) {
          // If a date IS given it must come from a real calendar entry.
          const known = TAU_CALENDARS.some(
            (c) =>
              c.FALL.teachingStart.getTime() === a.nextTeachingStart!.getTime() ||
              c.SPRING.teachingStart.getTime() === a.nextTeachingStart!.getTime(),
          );
          expect(known, `${y}-${m + 1} produced an unsourced ${a.nextTeachingStart.toISOString()}`).toBe(true);
        }
        const d = describeAcademicNow(at);
        expect(d.he, `${y}-${m + 1}`).not.toMatch(/15\.10\.20(2[89]|3\d)/);
      }
    }
  });

  it("still reports a real next start while a calendar covers it", () => {
    // Inside תשפ״ו SPRING, תשפ״ז FALL is known — this must NOT become null.
    const inSpring = getAcademicNow(new Date(2026, 4, 1));
    expect(inSpring.semester).toBe("SPRING");
    expect(inSpring.nextTeachingStart).not.toBeNull();
  });
});
