// #25 — "כפתור השיתוף בוואטסאפ ממש גרוע ואי אפשר באמת להבין ממנו כלום".
// The old message was one generic sentence plus a long ?d=<base64> URL: the
// recipient couldn't tell what was in the plan, and a wall of encoded
// characters from an unknown app reads like spam — the worst first contact for
// the only organic growth channel this product has.
import { describe, it, expect } from "vitest";
import { buildPlanShareText, type PlanShareCourse } from "@/lib/plan-share";

const c = (code: string, nameHe: string, credits: number,
           year = 2, semester: "FALL" | "SPRING" = "FALL"): PlanShareCourse =>
  ({ code, nameHe, credits, year, semester });

const PLAN = [
  c("1011-2109", "מיקרו כלכלה ב׳", 5),
  c("1011-2106", "מבוא לאקונומטריקה", 6),
  c("1011-2101", "מאקרו כלכלה", 6),
  c("0618-2200", "מבוא לפילוסופיה של המאה ה-19", 2),
  c("0651-3001", "סמינר מחקר", 4),
];

const URL = "https://pakam-strategist.vercel.app/he/shared-plan?d=eyJ2IjoxfQ";

describe("the message stands on its own", () => {
  const text = buildPlanShareText(PLAN, { url: URL, isHe: true });

  it("names the semester, so the message has a subject", () => {
    expect(text).toContain("שנה ב׳ סמסטר א׳");
  });

  it("states the size of the plan in courses and ש״ס", () => {
    expect(text).toContain("5 קורסים");
    expect(text).toContain("23 ש״ס"); // 5+6+6+2+4
  });

  it("names actual courses, so you know what you're being sent", () => {
    expect(text).toContain("מיקרו כלכלה ב׳");
    expect(text).toContain("מבוא לאקונומטריקה");
  });

  it("says how many more there are rather than listing everything", () => {
    expect(text).toContain("ועוד קורס אחד"); // 5 total, 4 named
  });

  it("still ends with the link", () => {
    expect(text.trimEnd().endsWith(URL)).toBe(true);
  });

  it("puts the link on its OWN line — not buried in a sentence", () => {
    // The old shape ("…כאן: https://…") is what made it read like spam.
    const lines = text.split("\n");
    expect(lines.some((l) => l.trim() === URL)).toBe(true);
  });
});

describe("counts read as Hebrew at one", () => {
  it("says 'קורס אחד' for a single-course plan", () => {
    const text = buildPlanShareText([c("1011-2109", "מיקרו כלכלה ב׳", 5)], { url: URL, isHe: true });
    expect(text).toContain("קורס אחד");
    expect(text).not.toMatch(/1 קורסים/);
  });
});

describe("edge cases", () => {
  it("degrades to a plain sentence for an empty plan, never a broken header", () => {
    const text = buildPlanShareText([], { url: URL, isHe: true });
    expect(text).toContain(URL);
    expect(text).not.toContain("0 קורסים");
  });

  it("picks the semester most of the plan is in", () => {
    const mixed = [
      c("a", "א", 2, 1, "FALL"),
      c("b", "ב", 2, 3, "SPRING"),
      c("d", "ד", 2, 3, "SPRING"),
    ];
    expect(buildPlanShareText(mixed, { url: URL, isHe: true })).toContain("שנה ג׳ סמסטר ב׳");
  });

  it("builds an English message, and falls back to the Hebrew course name", () => {
    const text = buildPlanShareText(PLAN, { url: URL, isHe: false });
    expect(text).toContain("My degree plan");
    expect(text).toContain("5 courses");
    expect(text).toContain("credits");
    // My first version of this test asserted NO Hebrew at all, and it was wrong:
    // most catalog rows carry only nameHe, and a Hebrew course name is far more
    // useful to the recipient than an empty bullet. The rail is that the CHROME
    // is English; the course names are whatever the catalog actually has.
    expect(text).toContain("מיקרו כלכלה ב׳");
    expect(text).not.toContain("תוכנית התואר שלי");
  });

  it("prefers an English course name when the catalog has one", () => {
    const text = buildPlanShareText(
      [{ code: "x", nameHe: "מיקרו", nameEn: "Microeconomics", credits: 5, year: 2, semester: "FALL" }],
      { url: URL, isHe: false },
    );
    expect(text).toContain("Microeconomics");
    expect(text).not.toContain("מיקרו");
  });
});
