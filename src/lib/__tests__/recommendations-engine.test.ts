import { describe, it, expect } from "vitest";
import {
  buildRecommendations,
  type RecCourse,
  type RecommendationInput,
} from "@/lib/recommendations-engine";

const NOW = new Date("2026-06-28T00:00:00Z");

function course(over: Partial<RecCourse>): RecCourse {
  return {
    status: "COMPLETED",
    grade: 90,
    courseType: "LECTURE",
    isMandatory: false,
    isBinary: false,
    credits: 3,
    nameHe: "קורס",
    nameEn: "Course",
    examDateB: null,
    discipline: "ECONOMICS",
    ...over,
  };
}

function input(over: Partial<RecommendationInput>): RecommendationInput {
  return {
    courses: [],
    courseAverage: 90,
    englishCourseCount: 2,
    amiramScore: null,
    hasFocusArea: true,
    currentYear: 2,
    miluimGroup: "NONE",
    binaryRemaining: 0,
    regulationResults: [],
    now: NOW,
    ...over,
  };
}

describe("buildRecommendations", () => {
  it("returns nothing for a healthy student with no gaps", () => {
    // Year 1 (no seminar nudge) + Amiram-exempt (no English-deadline/prompt).
    expect(
      buildRecommendations(input({ currentYear: 1, amiramScore: 140 }))
    ).toEqual([]);
  });

  it("flags a year-transition GPA risk when the overall average is below the bar", () => {
    const recs = buildRecommendations(input({ courseAverage: 72 }));
    expect(recs.some((r) => r.id === "gpa-risk")).toBe(true);
    expect(recs.find((r) => r.id === "gpa-risk")?.severity).toBe("critical");
  });

  it("recommends Moed B for a low grade with an upcoming second sitting", () => {
    const recs = buildRecommendations(
      input({
        courses: [
          course({
            grade: 65,
            nameHe: "מאקרו",
            examDateB: new Date("2026-07-10T00:00:00Z"),
          }),
        ],
      })
    );
    const moed = recs.find((r) => r.id.startsWith("moed-b-"));
    expect(moed).toBeTruthy();
    expect(moed?.bodyHe).toContain("65");
  });

  it("does NOT recommend Moed B once the second sitting is in the past", () => {
    const recs = buildRecommendations(
      input({
        courses: [
          course({ grade: 65, examDateB: new Date("2026-01-01T00:00:00Z") }),
        ],
      })
    );
    expect(recs.some((r) => r.id.startsWith("moed-b-"))).toBe(false);
    // …but it should fall through to a grade-improvement nudge instead.
    expect(recs.some((r) => r.id.startsWith("improve-"))).toBe(true);
  });

  it("applies the 80 bar only to PPE_CORE, not every mandatory course (audit fix)", () => {
    // A PPE_CORE course at 78 is below its 80 bar → worth improving.
    const ppeCore = buildRecommendations(
      input({
        currentYear: 1,
        amiramScore: 140,
        courses: [course({ grade: 78, discipline: "PPE_CORE", isMandatory: true, examDateB: null })],
      })
    );
    expect(ppeCore.some((r) => r.id.startsWith("improve-"))).toBe(true);

    // A mandatory Philosophy course at 78 is a solid pass (>=75) → NOT flagged.
    const philo = buildRecommendations(
      input({
        currentYear: 1,
        amiramScore: 140,
        courses: [course({ grade: 78, discipline: "PHILOSOPHY", isMandatory: true, examDateB: null })],
      })
    );
    expect(philo.some((r) => r.id.startsWith("improve-"))).toBe(false);
  });

  it("suggests a binary candidate for an eligible miluim student", () => {
    const recs = buildRecommendations(
      input({
        miluimGroup: "GROUP_C",
        binaryRemaining: 3,
        courses: [course({ grade: 68, credits: 5, nameHe: "מאקרו", examDateB: null })],
      })
    );
    expect(recs.some((r) => r.id.startsWith("binary-candidate-"))).toBe(true);
  });

  it("does NOT suggest binary for a non-miluim student", () => {
    const recs = buildRecommendations(
      input({
        miluimGroup: "NONE",
        binaryRemaining: 0,
        courses: [course({ grade: 68, credits: 5, examDateB: null })],
      })
    );
    expect(recs.some((r) => r.id.startsWith("binary-candidate-"))).toBe(false);
  });

  it("never suggests retaking a binary (pass/fail) course", () => {
    const recs = buildRecommendations(
      input({
        courses: [
          course({ grade: 60, isBinary: true, examDateB: new Date("2026-07-10T00:00:00Z") }),
        ],
      })
    );
    expect(recs.some((r) => r.id.startsWith("moed-b-"))).toBe(false);
    expect(recs.some((r) => r.id.startsWith("improve-"))).toBe(false);
  });

  it("uses the higher 80 bar for PPE_CORE courses", () => {
    // grade 78: passes the general 75 bar but fails the PPE_CORE 80 bar.
    const recs = buildRecommendations(
      input({
        currentYear: 1,
        amiramScore: 140,
        courses: [course({ grade: 78, discipline: "PPE_CORE", isMandatory: true, examDateB: null })],
      })
    );
    expect(recs.some((r) => r.id.startsWith("improve-"))).toBe(true);
  });

  it("nudges English when short and in year 2+, but not in year 1", () => {
    expect(
      buildRecommendations(
        input({ englishCourseCount: 0, currentYear: 2 })
      ).some((r) => r.id === "english")
    ).toBe(true);
    expect(
      buildRecommendations(
        input({ englishCourseCount: 0, currentYear: 1 })
      ).some((r) => r.id === "english")
    ).toBe(false);
  });

  it("flags the Amiram English deadline for a non-exempt Year-1 student", () => {
    const recs = buildRecommendations(input({ currentYear: 1, amiramScore: 133 }));
    const rec = recs.find((r) => r.id === "amiram-deadline");
    expect(rec).toBeTruthy();
    // Softened from critical→warning + sourced/conditional copy (audit A3):
    // no absolute "studies stop" verdict on a self-reported score.
    expect(rec?.severity).toBe("warning");
    expect(rec?.bodyHe).toContain("מתקדמים ב׳");
    expect(rec?.bodyHe).toContain("נכון לתשפ״ו");
    expect(rec?.bodyHe).not.toContain("הלימודים נעצרים");
  });

  it("does NOT flag the Amiram deadline once exempt (134+)", () => {
    const recs = buildRecommendations(input({ currentYear: 1, amiramScore: 140 }));
    expect(recs.some((r) => r.id === "amiram-deadline")).toBe(false);
  });

  it("prompts to add a missing Amiram score in Year 1", () => {
    const recs = buildRecommendations(input({ currentYear: 1, amiramScore: null }));
    expect(recs.some((r) => r.id === "amiram-missing")).toBe(true);
  });

  it("surfaces the most severe unmet requirement with a deficit", () => {
    const recs = buildRecommendations(
      input({
        regulationResults: [
          {
            ruleId: "DISC-LAW",
            ruleNameHe: "משפט",
            ruleNameEn: "Law",
            passed: false,
            severity: "ERROR",
            details: { deficit: 6 },
          },
          {
            ruleId: "DISC-PHIL",
            ruleNameHe: "פילוסופיה",
            ruleNameEn: "Philosophy",
            passed: false,
            severity: "ERROR",
            details: { deficit: 2 },
          },
        ],
      })
    );
    const gap = recs.find((r) => r.id.startsWith("gap-"));
    expect(gap?.id).toBe("gap-DISC-LAW"); // bigger deficit wins
  });

  it("ranks critical recommendations above informational ones and caps the list", () => {
    const recs = buildRecommendations(
      input({
        courseAverage: 60,
        englishCourseCount: 0,
        hasFocusArea: false,
        currentYear: 3,
        courses: [course({ grade: 50, examDateB: null })],
      }),
      4
    );
    expect(recs.length).toBeLessThanOrEqual(4);
    expect(recs[0]?.severity).toBe("critical");
  });
});

// ── #9 — the declared English level must beat the Amiram score ──────────
// Ariel: "אם קיבלתי 133 באמירנט אבל כבר סיימתי קורס מתקדמים ב׳?" — 133 places
// him at מתקדמים ב׳ BY SCORE, but finishing that course makes him exempt. The
// engine resolves this correctly; the dashboard simply never passed
// `englishLevel` alongside `amiramScore`, so the iron rule stopped applying on
// the most-seen screen in the app and he was still told he owes a level course.
describe("English: the declared level overrides the Amiram score (#9)", () => {
  it("drops the deadline warning once the student declares they're exempt", () => {
    const byScoreOnly = buildRecommendations(input({ currentYear: 1, amiramScore: 133 }));
    expect(byScoreOnly.some((r) => r.id === "amiram-deadline")).toBe(true);

    // Same score, but the student has declared the level they actually reached.
    const declared = buildRecommendations(
      input({ currentYear: 1, amiramScore: 133, englishLevel: "EXEMPT" }),
    );
    expect(declared.some((r) => r.id === "amiram-deadline")).toBe(false);
    // ...and we don't then nag them to add a score they already have.
    expect(declared.some((r) => r.id === "amiram-missing")).toBe(false);
  });

  it("uses a declared level when there is no score at all, and says so", () => {
    const recs = buildRecommendations(
      input({ currentYear: 1, amiramScore: null, englishLevel: "ADVANCED_B" }),
    );
    const rec = recs.find((r) => r.id === "amiram-deadline");
    expect(rec).toBeDefined();
    // Never attribute the conclusion to a score that was never entered.
    expect(rec?.bodyHe).toContain("לפי הרמה שנקלטה מהגיליון");
    expect(rec?.titleHe).not.toContain("אמירנט");
  });

  it("still asks for a score when neither the level nor the score is known", () => {
    const recs = buildRecommendations(input({ currentYear: 1, amiramScore: null }));
    expect(recs.some((r) => r.id === "amiram-missing")).toBe(true);
  });

  it("a declared lower level beats a score that would have exempted them", () => {
    // The sheet is the university's own placement — it wins in BOTH directions.
    const recs = buildRecommendations(
      input({ currentYear: 1, amiramScore: 140, englishLevel: "ADVANCED_A" }),
    );
    expect(recs.find((r) => r.id === "amiram-deadline")?.bodyHe).toContain("מתקדמים א׳");
  });
});
