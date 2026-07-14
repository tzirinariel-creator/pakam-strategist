import { describe, it, expect } from "vitest";
import {
  getAcademicNow,
  getPlanningAnchor,
  deriveYearOfStudy,
  hebrewYearLabel,
  getTeachingRange,
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
    expect(a.nextTeachingStart.getTime()).toBe(at(2026, 10, 18).setHours(0, 0, 0, 0));
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
