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
    expect(rec?.severity).toBe("critical");
    expect(rec?.bodyHe).toContain("מתקדמים ב׳");
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
