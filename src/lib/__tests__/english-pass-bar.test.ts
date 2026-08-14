// =========================================================================
// English is not just a label — it is a different pass bar (70, not 60)
// =========================================================================
// Four `isEnglishCourse` variants existed. TWO of them skipped the
// `courseType === "ENGLISH"` check and matched on the name only, and the two
// families used different regexes. That is not cosmetic duplication: English
// courses in the humanities faculty pass at 70
// (ENGLISH_CONFIG.COURSE_PASSING_GRADE), so a variant that misses an English
// course records a 65 as a PASS the university does not recognise — and one
// really did (audit deferred-4):
//
//   • onboarding step-history hardcoded `grade >= 60` for an OFF-CATALOG row,
//     while grade-sheet.decideAddition applied 70 to the identical case in the
//     /record scanner. The same grade sheet, scanned through two doors, gave
//     two different answers.
//   • the exam board used the generic 60 to decide a course was "passed" and
//     then HID its remaining sittings — hiding the Moed B from the one student
//     who still needs it.
import { describe, it, expect } from "vitest";
import {
  looksEnglishByName,
  isEnglishCourse,
  passBarForName,
} from "@/lib/english-standing";
import { passBarFor, ENGLISH_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";
import { decideAddition, decideApplication } from "@/lib/grade-sheet";

describe("looksEnglishByName — one name heuristic", () => {
  it("matches the real course names, in both languages", () => {
    expect(looksEnglishByName("אנגלית מתקדמים ב׳")).toBe(true);
    expect(looksEnglishByName("אנגלית לכלכלנים")).toBe(true);
    expect(looksEnglishByName("Academic English")).toBe(true);
    expect(looksEnglishByName("Business English-B")).toBe(true);
    expect(looksEnglishByName("ENGLISH FOR ACADEMIC PURPOSES")).toBe(true);
  });

  it("keeps the word boundary — the stricter of the two old regexes", () => {
    // `/english/i` (no boundary) matched these; `/\benglish\b/` does not. A
    // false POSITIVE raises a student's bar from 60 to 70, which is the
    // expensive direction to be wrong in, so the strict form wins.
    expect(looksEnglishByName("Englishman Studies")).toBe(false);
    expect(looksEnglishByName("Nonenglish Literature")).toBe(false);
  });

  it("is safe on nothing at all", () => {
    expect(looksEnglishByName(null)).toBe(false);
    expect(looksEnglishByName(undefined)).toBe(false);
    expect(looksEnglishByName("")).toBe(false);
  });
});

describe("isEnglishCourse — courseType FIRST, name only as a fallback", () => {
  it("trusts the canonical courseType even when the name says nothing", () => {
    // The variants that checked only the name got this WRONG.
    expect(isEnglishCourse({ courseType: "ENGLISH", nameHe: "כתיבה אקדמית" })).toBe(true);
  });

  it("falls back to the name for a catalog row not yet typed ENGLISH", () => {
    expect(isEnglishCourse({ courseType: "ELECTIVE", nameHe: "אנגלית טכנית" })).toBe(true);
    expect(isEnglishCourse({ courseType: "ELECTIVE", nameEn: "Advanced English" })).toBe(true);
  });

  it("says no to an ordinary course", () => {
    expect(isEnglishCourse({ courseType: "MANDATORY", nameHe: "מבוא ללוגיקה", nameEn: "Intro to Logic" })).toBe(false);
  });
});

describe("the bar itself is 70 for English and 60 for everything else", () => {
  it("passBarFor, by type", () => {
    expect(passBarFor("ENGLISH")).toBe(ENGLISH_CONFIG.COURSE_PASSING_GRADE);
    expect(passBarFor("ENGLISH")).toBe(70);
    expect(passBarFor("MANDATORY")).toBe(CREDIT_REQUIREMENTS.PASSING_GRADE);
    expect(passBarFor(undefined)).toBe(60);
  });

  it("passBarForName, for a row that carries no type at all", () => {
    expect(passBarForName("אנגלית מתקדמים ב")).toBe(70);
    expect(passBarForName("סטטיסטיקה לפכ״מ")).toBe(60);
    expect(passBarForName(null)).toBe(60);
  });
});

describe("the two doors into the same grade sheet now agree", () => {
  const matched = (courseType: string, grade: number) =>
    ({
      courseName: "אנגלית מתקדמים ב",
      courseCode: "0111-1111",
      grade,
      credits: 4,
      inProgress: false,
      passText: null,
      match: { courseType, id: "x", code: "0111-1111", nameHe: "אנגלית מתקדמים ב" },
    }) as never;

  const offCatalog = (courseName: string, grade: number) =>
    ({
      courseName,
      courseCode: "0999-9999",
      grade,
      credits: 4,
      inProgress: false,
      passText: null,
      match: null,
    }) as never;

  it("a matched English row at 65 is FAILED, at 70 COMPLETED", () => {
    expect(decideApplication(matched("ENGLISH", 65))?.status).toBe("FAILED");
    expect(decideApplication(matched("ENGLISH", 70))?.status).toBe("COMPLETED");
  });

  it("a matched non-English row keeps the 60 bar", () => {
    expect(decideApplication(matched("MANDATORY", 65))?.status).toBe("COMPLETED");
    expect(decideApplication(matched("MANDATORY", 59))?.status).toBe("FAILED");
  });

  it("an OFF-CATALOG English row at 65 is FAILED — the case onboarding got wrong", () => {
    expect(decideAddition(offCatalog("אנגלית מתקדמים ב", 65))?.status).toBe("FAILED");
    expect(decideAddition(offCatalog("אנגלית מתקדמים ב", 70))?.status).toBe("COMPLETED");
    // …and an ordinary off-catalog elective still passes at 60.
    expect(decideAddition(offCatalog("משבר האקלים וקיימות", 65))?.status).toBe("COMPLETED");
  });

  it("both doors use the SAME bar for the same row", () => {
    for (const grade of [59, 60, 65, 69, 70, 90]) {
      const viaName = grade >= passBarForName("אנגלית מתקדמים ב");
      const viaType = grade >= passBarFor("ENGLISH");
      expect(viaName).toBe(viaType);
    }
  });
});
