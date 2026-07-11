// מבחן-המלך המורחב (notes #13/#21) — the 30-question eval, run against the
// deterministic layer (router + rules) with a demo-shaped context. This is the
// permanent regression net: every question asserts WHERE it routes (rules vs
// LLM escalation) and, for rules answers, that the text carries the student's
// real numbers and never invents data. The live-LLM half of the eval needs a
// real Gemini key (Ariel's E2E) — documented in docs/מבחן-המלך.md.

import { describe, it, expect } from "vitest";
import { routeQuestion } from "@/lib/ai/answer-router";
import type { QAContext } from "@/lib/degree-qa";

// The demo student, as seeded on every demo login (11.7.2026 values).
const DEMO: QAContext = {
  isHe: true,
  effectiveTotal: 107,
  earned: 77,
  planned: 30,
  miluimExemption: 0,
  mandatory: 60,
  elective: 12,
  seminar: 0,
  focusAreaCredits: 37,
  focusAreaTarget: 60,
  englishCourseCount: 1,
  courseAverage: 87.1,
  hasFocusArea: true,
  focusAreaNameHe: "כלכלה",
  focusAreaNameEn: "Economics",
  currentYear: 2,
  gender: null,
  amiramScore: 140,
  miluimGroupName: null,
  binaryRemaining: 5,
  failedRules: [
    { nameHe: "דרישת נקודות זכות כוללת", nameEn: "Total credits", deficit: 43 },
  ],
  seminarPlannedCount: 0,
};

type Expect = {
  q: string;
  /** "rules" = answered from data, no LLM; "llm" = escalates. */
  route: "rules" | "llm";
  /** Substrings the deterministic answer must contain. */
  contains?: string[];
  /** Substrings that must NOT appear (the "don't invent" guard). */
  never?: string[];
};

const QUESTIONS: Expect[] = [
  // ── data lookups (must stay free + exact) ──
  { q: "כמה ש״ס צברתי?", route: "rules", contains: ["107", "77", "30"] },
  { q: "כמה נקודות זכות נשארו לי?", route: "rules", contains: ["43"] },
  { q: "מה הממוצע שלי?", route: "rules", contains: ["87.1"] },
  { q: "מה חסר לי לתואר?", route: "rules", contains: ["נקודות זכות"] },
  { q: "כמה קורסי בחירה עשיתי?", route: "rules", contains: ["12"] },
  { q: "כמה סמינרים אני צריך?", route: "rules" },
  { q: "מה מצב האנגלית שלי?", route: "rules", contains: ["140"] },
  { q: "מה זה תחום מיקוד?", route: "rules", contains: ["כלכלה"] },
  { q: "מה תנאי המעבר לשנה הבאה?", route: "rules" },
  { q: "איך מחשבים את ציון הגמר?", route: "rules", contains: ["78"] },
  { q: "מה זה קורס בינארי?", route: "rules" },
  { q: "מתי מועד ב׳?", route: "rules" },
  { q: "מה ההצטיינות פה?", route: "rules" },
  { q: "כמה ש״ס כדאי לקחת בסמסטר?", route: "llm" },

  // ── the "don't invent" traps ──
  { q: "מה הציון שלי בקורס של סמסטר ב׳?", route: "rules", contains: ["תיק"], never: ["87.1"] },
  { q: "אין לי ציון במאקרו, מה הציון שלי שם?", route: "rules", contains: ["תיק"], never: ["87.1"] },
  { q: "כמה נקודות בידינג לשים על מאקרו?", route: "rules", never: ["87.1"] },
  { q: "כמה נקודות מילואים מגיעות לי?", route: "rules" },

  // ── judgment questions (must escalate — rules alone aren't enough) ──
  { q: "למה הממוצע שלי ירד?", route: "llm" },
  { q: "כדאי לי להמיר קורס לבינארי?", route: "llm" },
  { q: "מה עדיף — כלכלה או מדע המדינה בתור מיקוד?", route: "llm" },
  { q: "איך כדאי לפזר את הלמידה עד המבחנים?", route: "llm" },
  { q: "שווה לי לקחת 6 קורסים בסמסטר?", route: "llm" },
  { q: "מה יקרה אם אכשל בקורס חובה?", route: "llm" },
  { q: "תמליץ לי על קורסי בחירה", route: "llm" },

  // ── no-match / off-topic (must escalate or honestly say "not sure") ──
  { q: "מה דעתך על החיים?", route: "llm" },
  { q: "ספר לי בדיחה", route: "llm" },
  { q: "מה מזג האוויר מחר?", route: "llm" },

  // ── English-locale sanity ──
  { q: "how many credits do I have left?", route: "rules", contains: ["43"] },
  { q: "should I take 6 courses next semester?", route: "llm" },
];

describe("מבחן-המלך — 30 questions through the router", () => {
  it("has exactly 30 questions", () => {
    expect(QUESTIONS.length).toBe(30);
  });

  for (const t of QUESTIONS) {
    it(`${t.route === "rules" ? "🟢" : "🔮"} ${t.q}`, () => {
      const ctx: QAContext = { ...DEMO, isHe: !/[a-z]/i.test(t.q[0]!) };
      const r = routeQuestion(t.q, ctx);

      if (t.route === "rules") {
        expect(r.matched).toBe(true);
        expect(r.shouldEscalate).toBe(false);
      } else {
        expect(r.shouldEscalate).toBe(true);
      }
      for (const c of t.contains ?? []) {
        expect(r.deterministic.text).toContain(c);
      }
      for (const n of t.never ?? []) {
        expect(r.deterministic.text).not.toContain(n);
      }
    });
  }

  it("the deterministic fallback NEVER invents a number it wasn't given", () => {
    // An empty student: no grades, no credits. Every rules answer must not
    // contain a fabricated average.
    const empty: QAContext = {
      ...DEMO,
      effectiveTotal: 0,
      earned: 0,
      planned: 0,
      elective: 0,
      focusAreaCredits: 0,
      courseAverage: null,
      failedRules: [],
    };
    const r = routeQuestion("מה הממוצע שלי?", empty);
    expect(r.matched).toBe(true);
    expect(r.deterministic.text).toContain("אין");
    expect(r.deterministic.text).not.toMatch(/\d{2}\.\d/);
  });

  it("gendered address: female phrasing for a female student", () => {
    const r = routeQuestion("מה הממוצע שלי?", { ...DEMO, courseAverage: null, gender: "female" });
    expect(r.deterministic.text).toContain("הזני");
  });

  it("gendered address: male phrasing for a male student", () => {
    const r = routeQuestion("מה הממוצע שלי?", { ...DEMO, courseAverage: null, gender: "male" });
    expect(r.deterministic.text).toContain("הזן ");
  });

  // The "18.7.2024" bug — the date must come from the machine, never the LLM.
  it("answers today's date deterministically, with the REAL date", () => {
    const now = new Date(2026, 6, 11); // Saturday 11.7.2026
    const r = routeQuestion("מה התאריך היום?", { ...DEMO, now });
    expect(r.matched).toBe(true);
    expect(r.shouldEscalate).toBe(false);
    expect(r.deterministic.text).toContain("11.7.2026");
    expect(r.deterministic.text).toContain("שבת");
    expect(r.deterministic.text).not.toContain("2024");
  });

  it("answers 'what day is it' in English too", () => {
    const now = new Date(2026, 6, 11);
    const r = routeQuestion("what day is it today?", { ...DEMO, isHe: false, now });
    expect(r.matched).toBe(true);
    expect(r.deterministic.text).toContain("Saturday");
  });
});
