// =========================================
// Pakamon — Application Constants
// =========================================
// Program-specific values are derived from the active ProgramDefinition.
// Universal / UI config stays here directly.
// Downstream code imports the same names — zero changes needed.
// =========================================

import { getActiveProgram } from "@/lib/programs/registry";
import type { ProgramDefinition } from "@/lib/programs/types";

export const APP_NAME = "Pakamon";
export const APP_NAME_HE = "פכמון";

// ── Discipline display config ──────────────────────────────────────

export interface DisciplineDisplayConfig {
  nameEn: string;
  nameHe: string;
  color: string;
  bgClass: string;
  textClass: string;
  badgeClass: string;
  // ── Added in C8-C9: used by UI components instead of hardcoded lists ──
  glowClass: string;       // "shadow-philosophy-glow" (empty for GENERAL)
  borderClass: string;     // "border-discipline-philosophy"
  slug: string;            // "philosophy", "polsci", "ppe"
  isFocusOption: boolean;  // can be chosen as focus area
  sortOrder: number;       // index in program.disciplines array
}

/**
 * CSS-class slug for a discipline ID.
 * PHILOSOPHY → "philosophy", POLITICAL_SCIENCE → "polsci", PPE_CORE → "ppe", etc.
 */
const SLUG_MAP: Record<string, string> = {
  // PPE disciplines
  PHILOSOPHY: "philosophy",
  ECONOMICS: "economics",
  POLITICAL_SCIENCE: "polsci",
  LAW: "law",
  PPE_CORE: "ppe",
  // Law (LLB) disciplines
  LAW_MANDATORY: "law-core",
  PRIVATE_LAW: "private",
  PUBLIC_LAW: "public",
  COMMERCIAL_LAW: "commercial",
  CRIMINAL_LAW: "criminal",
  INTERNATIONAL_LAW: "intl",
  // GENERAL handled separately (uses muted-foreground)
};

function buildDisciplineConfig(
  program: ProgramDefinition
): Record<string, DisciplineDisplayConfig> {
  const config: Record<string, DisciplineDisplayConfig> = {};

  for (const [index, d] of program.disciplines.entries()) {
    if (d.id === "GENERAL") {
      // General uses muted-foreground, not a discipline CSS variable
      config[d.id] = {
        nameEn: d.nameEn,
        nameHe: d.nameHe,
        color: "hsl(var(--muted-foreground))",
        bgClass: "bg-muted-foreground",
        textClass: "text-muted-foreground",
        badgeClass: "bg-muted/20 text-muted-foreground border-muted/30",
        glowClass: "",
        borderClass: "border-foreground/20",
        slug: "general",
        isFocusOption: false,
        sortOrder: index,
      };
      continue;
    }

    const slug = SLUG_MAP[d.id] ?? d.id.toLowerCase();
    config[d.id] = {
      nameEn: d.nameEn,
      nameHe: d.nameHe,
      color: d.color,
      bgClass: `bg-discipline-${slug}`,
      textClass: `text-discipline-${slug}`,
      badgeClass: `bg-discipline-${slug}/20 text-discipline-${slug} border-discipline-${slug}/30`,
      glowClass: `shadow-${slug}-glow`,
      borderClass: `border-discipline-${slug}`,
      slug,
      isFocusOption: d.isFocusOption,
      sortOrder: index,
    };
  }

  return config;
}

// ── Per-program caches (avoid recomputing on every call) ────────
const _disciplineConfigCache = new Map<string, Record<string, DisciplineDisplayConfig>>();

// ── Factory functions (per-program) ──────────────────────────────
// These accept an optional ProgramDefinition. When omitted, they
// fall back to the default program (PPE). Use these for per-user
// program support; the module-level constants below are backwards-
// compatible aliases that always resolve to the default program.

/** Get DISCIPLINE_CONFIG for a specific program (cached). */
export function getDisciplineConfigFor(
  program?: ProgramDefinition
): Record<string, DisciplineDisplayConfig> {
  const p = program ?? getActiveProgram();
  const cached = _disciplineConfigCache.get(p.id);
  if (cached) return cached;
  const config = buildDisciplineConfig(p);
  _disciplineConfigCache.set(p.id, config);
  return config;
}

/** Get all discipline IDs in program order. */
export function getAllDisciplineIdsFor(program?: ProgramDefinition): string[] {
  const p = program ?? getActiveProgram();
  return p.disciplines.map((d) => d.id);
}

/** Get discipline IDs that can be chosen as focus area. */
export function getFocusDisciplineIdsFor(program?: ProgramDefinition): string[] {
  const p = program ?? getActiveProgram();
  return p.disciplines.filter((d) => d.isFocusOption).map((d) => d.id);
}

/** Get discipline IDs suitable for filtering (all except GENERAL). */
export function getFilterableDisciplineIdsFor(program?: ProgramDefinition): string[] {
  const p = program ?? getActiveProgram();
  return p.disciplines.filter((d) => d.id !== "GENERAL").map((d) => d.id);
}

// ── Module-level constants (backwards-compatible, always default program) ──

/** @deprecated Use getDisciplineConfigFor(program) for per-user support. */
export const DISCIPLINE_CONFIG: Record<string, DisciplineDisplayConfig> =
  buildDisciplineConfig(getActiveProgram());

/** @deprecated Use getAllDisciplineIdsFor(program) for per-user support. */
export const ALL_DISCIPLINE_IDS: string[] =
  getActiveProgram().disciplines.map((d) => d.id);

/** @deprecated Use getFocusDisciplineIdsFor(program) for per-user support. */
export const FOCUS_DISCIPLINE_IDS: string[] =
  getActiveProgram().disciplines.filter((d) => d.isFocusOption).map((d) => d.id);

/** @deprecated Use getFilterableDisciplineIdsFor(program) for per-user support. */
export const FILTERABLE_DISCIPLINE_IDS: string[] =
  getActiveProgram().disciplines.filter((d) => d.id !== "GENERAL").map((d) => d.id);

// ── Program-derived constants ──────────────────────────────────────
// These keep the exact same shape & values as before,
// but are now computed from the active ProgramDefinition.

function buildCreditRequirements(program: ProgramDefinition) {
  // Elective-specific values are PPE-specific and don't map cleanly
  // to ProgramDefinition yet. Future: add electiveCredits to ProgramDefinition.
  //
  // NOTE: Discipline-specific credits (PHILOSOPHY: 18, etc.) are NOT included
  // here — use getDisciplineCredits(id) instead. This avoids index-signature
  // issues with noUncheckedIndexedAccess.
  return {
    TOTAL: program.creditRequirements.total,
    FOCUS_AREA_MIN: program.creditRequirements.focusAreaMin,
    ENGLISH_MIN_COURSES: program.creditRequirements.englishCourses,
    ENGLISH_MIN_CREDITS_PER_COURSE: 2,
    // VERIFIED נכון לתשפ"ו: 150 = 103 mandatory (incl. PPE seminar) + 12 seminars + 35 electives.
    MANDATORY_TOTAL: program.creditRequirements.mandatoryCredits ?? 0,
    SEMINAR_TOTAL: program.creditRequirements.seminarCredits ?? 0,
    ELECTIVE_TOTAL: program.creditRequirements.electiveCredits ?? 0,
    PRACTICE_ELECTIVE_MAX: 8,
    PRACTICE_COURSE_MAX_CREDITS: 4,
    PASSING_GRADE: program.creditRequirements.passingGrade,
    GRADUATION_MIN_SCORE: program.creditRequirements.graduationMinScore,
  } as const;
}

/**
 * Get minimum credits for a discipline.
 * Accepts an optional program; defaults to active program if omitted.
 * Returns 0 if discipline not found.
 */
export function getDisciplineCredits(
  disciplineId: string,
  program?: ProgramDefinition
): number {
  const p = program ?? getActiveProgram();
  return p.disciplines.find((d) => d.id === disciplineId)?.minCredits ?? 0;
}

function buildSeminarRequirements(program: ProgramDefinition) {
  const sem = program.seminarRequirements;
  // Use first discipline rule (e.g., ECONOMICS for PPE) — generic, not hardcoded
  const firstRule = sem?.disciplineRules?.[0];
  return {
    TOTAL: (sem?.totalPapers ?? 0) + (sem?.referats ?? 0),
    PAPERS: sem?.totalPapers ?? 0,
    REFERATS: sem?.referats ?? 0,
    MAX_DISCIPLINE_SEMINARS: firstRule?.maxPerYear ?? 2,
    DISCIPLINE_RULE_ID: firstRule?.disciplineId ?? null,
    MIN_CREDITS_FOR_SUBMISSION: 3,
  } as const;
}

function buildGradeRequirements(program: ProgramDefinition) {
  return {
    YEAR_TRANSITION_OVERALL_GPA: program.creditRequirements.yearTransitionGpa,
    YEAR_TRANSITION_PPE_GPA:
      program.creditRequirements.yearTransitionMajorGpa ?? 80,
    MAX_GRADE_IMPROVEMENTS: 2,
    MAX_FAILURES_SAME_COURSE: 2,
    PRIOR_STUDIES_MIN_GRADE: 80,
    APPEAL_DAYS: 5,
  } as const;
}

function buildGradeWeights(program: ProgramDefinition) {
  return {
    COURSES: program.gradeFormula.courseWeight,
    SEMINAR_PAPERS: program.gradeFormula.seminarWeight,
    REFERAT: program.gradeFormula.referatWeight,
  } as const;
}

// ── Per-program caches for derived constants ──
const _creditReqCache = new Map<string, ReturnType<typeof buildCreditRequirements>>();
const _seminarReqCache = new Map<string, ReturnType<typeof buildSeminarRequirements>>();
const _gradeReqCache = new Map<string, ReturnType<typeof buildGradeRequirements>>();
const _gradeWeightsCache = new Map<string, ReturnType<typeof buildGradeWeights>>();

/** Get credit requirements for a specific program (cached). */
export function getCreditRequirementsFor(program?: ProgramDefinition) {
  const p = program ?? getActiveProgram();
  const cached = _creditReqCache.get(p.id);
  if (cached) return cached;
  const req = buildCreditRequirements(p);
  _creditReqCache.set(p.id, req);
  return req;
}

/** Get seminar requirements for a specific program (cached). */
export function getSeminarRequirementsFor(program?: ProgramDefinition) {
  const p = program ?? getActiveProgram();
  const cached = _seminarReqCache.get(p.id);
  if (cached) return cached;
  const req = buildSeminarRequirements(p);
  _seminarReqCache.set(p.id, req);
  return req;
}

/** Get grade requirements for a specific program (cached). */
export function getGradeRequirementsFor(program?: ProgramDefinition) {
  const p = program ?? getActiveProgram();
  const cached = _gradeReqCache.get(p.id);
  if (cached) return cached;
  const req = buildGradeRequirements(p);
  _gradeReqCache.set(p.id, req);
  return req;
}

/** Get grade weights for a specific program (cached). */
export function getGradeWeightsFor(program?: ProgramDefinition) {
  const p = program ?? getActiveProgram();
  const cached = _gradeWeightsCache.get(p.id);
  if (cached) return cached;
  const req = buildGradeWeights(p);
  _gradeWeightsCache.set(p.id, req);
  return req;
}

// ── Module-level constants (backwards-compatible, always default program) ──

/** @deprecated Use getCreditRequirementsFor(program) for per-user support. */
export const CREDIT_REQUIREMENTS = buildCreditRequirements(getActiveProgram());

/** @deprecated Use getSeminarRequirementsFor(program) for per-user support. */
export const SEMINAR_REQUIREMENTS = buildSeminarRequirements(getActiveProgram());

/** @deprecated Use getGradeRequirementsFor(program) for per-user support. */
export const GRADE_REQUIREMENTS = buildGradeRequirements(getActiveProgram());

/** @deprecated Use getGradeWeightsFor(program) for per-user support. */
export const GRADE_WEIGHTS = buildGradeWeights(getActiveProgram());

// Semester display config
export const SEMESTER_CONFIG = {
  FALL: { nameEn: "Fall (A)", nameHe: "סמסטר א׳", short: "א׳", shortEn: "Fall" },
  SPRING: { nameEn: "Spring (B)", nameHe: "סמסטר ב׳", short: "ב׳", shortEn: "Spring" },
  SUMMER: { nameEn: "Summer", nameHe: "סמסטר קיץ", short: "קיץ", shortEn: "Summer" },
} as const;

/**
 * Single source of truth for semester *teaching* periods, pinned to TAU 2025/26.
 * Used by both the .ics export (src/lib/ics-export.ts) and the Google Calendar
 * sync (src/server/routers/schedule.ts) so recurring classes land on identical
 * dates regardless of which export path the student uses. These are the
 * teaching ranges (first lecture → last lecture), not the wider classification
 * windows in MILUIM_CONFIG.SEMESTER_DATES_2026.
 *
 * Months are 0-indexed (JS Date convention): 9 = October, 0 = January, etc.
 */
export const SEMESTER_TEACHING_DATES: Record<
  "FALL" | "SPRING",
  { start: Date; end: Date }
> = {
  FALL: {
    start: new Date(2025, 9, 19), // Oct 19 2025
    end: new Date(2026, 0, 16), // Jan 16 2026 (teaching end)
  },
  SPRING: {
    start: new Date(2026, 2, 8), // Mar 8 2026
    end: new Date(2026, 5, 12), // Jun 12 2026
  },
} as const;

// Year display config
export const YEAR_CONFIG = {
  1: { nameEn: "Year A", nameHe: "שנה א׳" },
  2: { nameEn: "Year B", nameHe: "שנה ב׳" },
  3: { nameEn: "Year C", nameHe: "שנה ג׳" },
} as const;

// Calendar event colors
export const EVENT_COLORS = {
  LECTURE: "#4A90D9",
  EXAM: "#E74C3C",
  ASSIGNMENT_DUE: "#FFA502",
  STUDY_BLOCK: "#4A90D9",
  OFFICE_HOURS: "#2ECC71",
  CUSTOM: "#8B949E",
  GOOGLE_SYNCED: "#6B7280",
} as const;

// ────────────────────────────────────────────────────────────────────
// Miluim (military reserve) accommodations — per official מתווה תשפ״ו
// Source: Official TAU document "מידע על מתווה מילואים תל אביב"
// Cross-referenced: February 2026
// ────────────────────────────────────────────────────────────────────
export const MILUIM_CONFIG = {
  // Credit exemption caps (ש"ס פטור) — per official doc section 3
  MAX_CREDIT_EXEMPTIONS_DEGREE: 10,  // max across entire BA degree (all groups)
  // Binary grade caps — per official doc section 4
  BINARY_GRADE: {
    BA_DEGREE_CAP: 5,          // max 5 courses across entire BA
    MA_DEGREE_CAP: 2,          // max 2 courses across entire MA
    BA_MAX_PERCENT: 10,        // cannot exceed 10% of BA credit points
    MA_MAX_PERCENT: 20,        // cannot exceed 20% of MA credit points
    EXCELLENCE_MAX_PERCENT: 25, // binary ≤ 25% of annual hours to be excellence candidate
    // Courses that CANNOT be converted to binary
    EXCLUDED: [
      "licensing_courses",       // קורסי רישוי מקצועי
      "doctoral_admission",      // קורסי קבלה לדוקטורט
      "seminar_papers",          // עבודות סמינריוניות
      "thesis_track",            // קורסים חיוניים למסלול גמר
    ] as string[],
  },
  // Per-group exemptions and benefits
  GROUPS: {
    NONE: {
      nameHe: "לא משרת/ת במילואים",
      nameEn: "Not serving in reserves",
      descHe: "",
      descEn: "",
      criteria: "",
      criteriaEn: "",
      creditExemptionPerYear: 0,
      binaryGradePerYear: 0,
      binaryGradeDegreeCap: 0,
      isCombat: false,
      attendanceExempt: false,
      examChoice2of3: false,
      examTimeBonus: 0,           // % extra time
      biddingBonus: 0,            // % extra bidding points
      homeworkShield: false,      // ציון מגן (homework as safety net)
      courseCancelNoCharge: false, // ביטול רישום ללא חיוב
      prerequisiteFlexibility: false,
      benefits: [] as string[],
    },
    GROUP_A: {
      nameHe: "קבוצה A — עד 20 ימים בסמסטר",
      nameEn: "Group A — Up to 20 days per semester",
      descHe: "משרתי מילואים: עד 20 ימים מצטברים בסמסטר",
      descEn: "Reservists: up to 20 cumulative days/semester",
      criteria: "משרתי מילואים: עד 20 ימים בסמסטר",
      criteriaEn: "Reservists: ≤20 days/semester",
      creditExemptionPerYear: 2,   // 2 ש"ס — for NEW students with 10+ days
      binaryGradePerYear: 0,
      binaryGradeDegreeCap: 0,
      isCombat: false,
      attendanceExempt: false,     // attendance per חוק זכויות הסטודנט only
      examChoice2of3: false,       // NOT eligible for 2-of-3 exam choice
      examTimeBonus: 0,
      biddingBonus: 0,
      homeworkShield: false,
      courseCancelNoCharge: false,
      prerequisiteFlexibility: false,
      benefits: [
        "פטור 2 ש״ס (לסטודנטים חדשים בגין 10+ ימי מילואים, עד 10 בתואר)",
        "הקלטות והנגשת חומרי לימוד",
        "מועדי בחינה לפי חוק זכויות הסטודנט",
      ],
    },
    GROUP_B: {
      nameHe: "קבוצה B — 21-34 ימים בסמסטר",
      nameEn: "Group B — 21-34 days per semester",
      descHe: "21-34 ימים בסמסטר; או לוחמים 14-20 ימים; או 35+ ימים מצטברים בשנת תשפ\"ו (סמ׳ ב׳); או 60+ ימים לפני פתיחת סמסטר; או 100+ בתשפ\"ה (סמ׳ א׳ רטרואקטיבית)",
      descEn: "21-34 days/semester; or combat 14-20 days; or 35+ cumulative in year (sem B); or 60+ days before semester; or 100+ in prev year (sem A retroactive)",
      criteria: "21-34 ימים/סמסטר | לוחמים 14-20 | 35+ בשנה | 60+ לפני סמסטר | 100+ בתשפ\"ה",
      criteriaEn: "21-34 days/sem | combat 14-20 | 35+ in year | 60+ pre-semester | 100+ prev year",
      creditExemptionPerYear: 6,   // 6 ש"ס per year
      binaryGradePerYear: 2,       // BA: 2 courses/year; MA: 1 course/year
      binaryGradeDegreeCap: 5,     // BA: max 5 across degree
      isCombat: false,
      attendanceExempt: true,      // פטור מנוכחות (למעט סדנאות/מעשי)
      examChoice2of3: true,        // 2 מתוך 3 מועדים, הציון הגבוה קובע
      examTimeBonus: 0,            // no extra time (only C gets this)
      biddingBonus: 0,             // no bidding bonus (only C gets this)
      homeworkShield: true,        // ציון מגן למטלות בית
      courseCancelNoCharge: true,  // ביטול רישום ללא חיוב (אם לא נבחן)
      prerequisiteFlexibility: true, // גמישות בדרישות קדם למי שלקח ולא עבר
      benefits: [
        "פטור 6 ש״ס בשנה (עד 10 בתואר)",
        "2 קורסים בציון עובר/לא עובר בשנה (עד 5 בתואר, עד 10% מנ\"ז)",
        "בחירת 2 מתוך 3 מועדי בחינה — הציון הגבוה ביותר קובע (אוטומטי)",
        "פטור מחובת נוכחות (למעט סדנאות וקורסים מעשיים)",
        "ציון ש״ב כרשת ביטחון (ציון מבחן קובע אם גבוה יותר)",
        "גמישות בדרישות קדם (למי שלקח ולא עבר)",
        "הקלטות והנגשת חומרי לימוד",
        "דחיית הגשת עבודות",
        "רישום מאוחר לקורסים",
        "ביטול רישום לקורס ללא חיוב (אם לא נבחנת)",
      ],
    },
    GROUP_C: {
      nameHe: "קבוצה C — 35+ ימים בסמסטר",
      nameEn: "Group C — 35+ days per semester",
      descHe: "35+ ימים מצטברים בסמסטר; או 100+ ימים בסמ׳ א׳ (מזכה גם בסמ׳ ב׳). לוחמים: 21+ ימים בסמסטר",
      descEn: "35+ cumulative days/semester; or 100+ days in sem A (gives C in sem B too). Combat: 21+ days/semester",
      criteria: "35+ ימים/סמסטר | 100+ בסמ׳ א׳→גם ב׳ | לוחמים: 21+",
      criteriaEn: "35+ days/sem | 100+ in sem A→also B | Combat: 21+",
      creditExemptionPerYear: 8,   // 8 ש"ס per year
      binaryGradePerYear: 3,       // BA: 3 courses/year; MA: 2 courses/year
      binaryGradeDegreeCap: 5,     // BA: max 5 across degree
      isCombat: false,
      attendanceExempt: true,      // פטור מנוכחות
      examChoice2of3: true,        // 2 מתוך 3 מועדים, הציון הגבוה קובע
      examTimeBonus: 25,           // 25% תוספת זמן (עד 50% מצטבר)
      biddingBonus: 10,            // +10% נקודות שיבוץ/בידינג
      homeworkShield: true,        // ציון מגן למטלות בית
      courseCancelNoCharge: true,  // ביטול רישום ללא חיוב
      prerequisiteFlexibility: true,
      benefits: [
        "פטור 8 ש״ס בשנה (עד 10 בתואר)",
        "3 קורסים בציון עובר/לא עובר בשנה (עד 5 בתואר, עד 10% מנ\"ז)",
        "בחירת 2 מתוך 3 מועדי בחינה — הציון הגבוה ביותר קובע (אוטומטי)",
        "25% תוספת זמן בבחינות (עד 50% מצטבר עם תוספות אחרות)",
        "+10% נקודות שיבוץ (בידינג) לרישום לקורסים",
        "פטור מחובת נוכחות (למעט סדנאות וקורסים מעשיים)",
        "ציון ש״ב כרשת ביטחון",
        "גמישות בדרישות קדם",
        "הקלטות והנגשת חומרי לימוד",
        "דחיית הגשת עבודות",
        "רישום מאוחר לקורסים",
        "ביטול רישום לקורס ללא חיוב (אם לא נבחנת)",
      ],
    },
    GROUP_G: {
      nameHe: "קבוצה G — נפגעי מלחמה ומשפחות שכולות",
      nameEn: "Group G — War casualties & bereaved families",
      descHe: "נפגעי מלחמה, משפחות שכולות, פצועים, כוחות ביטחון, סדיר, קרבה ראשונה לחללים — מטופלים ע״י דיקנט הסטודנטים",
      descEn: "War casualties, bereaved families, wounded, security forces, regular army, first-degree relatives of fallen — handled by Dean of Students",
      criteria: "נפגעי מלחמה, שכולים, פצועים, כוחות ביטחון, סדיר",
      criteriaEn: "War casualties, bereaved, wounded, security forces, regular army",
      creditExemptionPerYear: 3,   // 3 ש"ס (new students only)
      binaryGradePerYear: 0,       // 6 ש"ס binary (for new students who weren't in previous מתווה)
      binaryGradeDegreeCap: 0,
      isCombat: false,
      attendanceExempt: true,
      examChoice2of3: true,        // 2 מתוך 3 מועדים (BA only)
      examTimeBonus: 0,
      biddingBonus: 0,
      homeworkShield: false,
      courseCancelNoCharge: false,
      prerequisiteFlexibility: false,
      benefits: [
        "פטור 3 ש״ס (סטודנטים חדשים בלבד, עד 10 בתואר)",
        "בחירת 2 מתוך 3 מועדי בחינה (תואר ראשון)",
        "פטור מחובת נוכחות (למעט סדנאות ומעשי)",
        "הקלטות והנגשת חומרי לימוד",
        "דחיית הגשת עבודות",
        "התאמות אקדמיות מיוחדות (פרטניות)",
        "ליווי אישי מדיקנט הסטודנטים",
      ],
    },
  },
  // Combat soldier bonus: fighters get enhanced group mapping
  // Per official doc: לוחמים 14-20 → A, 21+ → C (per semester) or 21+ cumulative in year → B (sem B only)
  COMBAT_UPGRADE: {
    descHe: "לוחם/ת (ייעוד קדמי) — שיוך לקבוצה מיטיבה יותר",
    descEn: "Combat soldier (front-line designation) — mapped to enhanced group",
    perSemesterRules: [
      { minDays: 14, maxDays: 20, mappedGroup: "GROUP_B" as const, descHe: "14-20 ימים בסמסטר → קבוצה B" },
      { minDays: 21, maxDays: Infinity, mappedGroup: "GROUP_C" as const, descHe: "21+ ימים בסמסטר → קבוצה C" },
    ],
    yearCumulativeRules: [
      { minDays: 21, mappedGroup: "GROUP_B" as const, semester: "SPRING" as const, descHe: "21+ ימים מצטברים בשנת תשפ\"ו → קבוצה B בסמ׳ ב׳ בלבד" },
    ],
  },
  // 300+ fighters — automatic C through degree completion
  // Per official doc: לוחמים ששירתו 300+ ימים מאז 7.10.23, כולל בני זוגם עם ילדים עד גיל 13
  FIGHTERS_300_PLUS: {
    nameHe: "לוחם/ת 300+ ימים",
    nameEn: "Fighter 300+ days since 7.10.23",
    descHe: "לוחם/ת שביצע/ה 300+ ימי מילואים בייעוד קדמי מאז 7.10.23 (בהיותם סטודנטים) — קבוצה C אוטומטית. כולל בני/ות זוג עם ילדים עד גיל 13",
    descEn: "Combat fighter with 300+ reserve days since 7.10.23 (while enrolled) — automatic Group C. Includes spouses with children under 13",
    group: "GROUP_C" as const,
    minDaysSince7Oct: 300,
    includesSpouse: true, // spouse with children under 13 also gets C
  },
  // Spouse eligibility — per official doc section 2
  SPOUSE_RULES: {
    descHe: "בן/בת זוג של משרת/ת מילואים (הורה לילדים עד גיל 13)",
    descEn: "Spouse of reservist (parent of children under 13)",
    maxChildAge: 13,
    // Spouse mirrors the serving partner's group under these conditions:
    groupB: "בן/ת זוג שירת 21-34 ימים בסמסטר, או עמד בתנאי שירות ממושך (60+ ימים לפני סמסטר וכו')",
    groupC: "בן/ת זוג שירת 35+ ימים בסמסטר",
  },
  // Retroactive rules — per official doc section 2
  RETROACTIVE: {
    descHe: "100+ ימים בתשפ\"ה → קבוצה B בסמ׳ א׳ תשפ\"ו (לסטודנטים פעילים בתשפ\"ה)",
    descEn: "100+ days in 5785 → Group B in sem A 5786 (for students active in 5785)",
    prevYearMinDays: 100,
    grantedGroup: "GROUP_B" as const,
    grantedSemester: "FALL" as const,
    requiresActiveInPrevYear: true,
  },
  // Tuition fee exemptions — per official doc section 5
  TUITION: {
    dragging42: { daysRequired: 42, semestersExempt: 1, descHe: "42+ ימים מצטברים בתשפ\"ו — פטור דמי גרירה סמסטר 1" },
    dragging84: { daysRequired: 84, semestersExempt: 2, descHe: "84+ ימים מצטברים בתשפ\"ו — פטור דמי גרירה 2 סמסטרים" },
    dragging150: { daysRequired: 150, semestersExempt: 2, descHe: "150+ ימים מצטברים בתואר — פטור גרירה 2 סמסטרים (חוק זכויות הסטודנט, אין כפל מעבר ל-2)" },
    completionBenefit: {
      descHe: "קבוצה C + סיום חובות שמיעה בתשפ\"ו + הגשת עבודה אחרונה עד 31/12/26 → פטור גרירה בתשפ\"ז",
      descEn: "Group C + finish coursework in 5786 + submit last paper by 31/12/26 → dragging exemption in 5787",
      requiredGroup: "GROUP_C" as const,
      submissionDeadline: "2026-12-31",
    },
  },
  // STEM special exam — per official doc section 4
  STEM_SPECIAL_EXAM: {
    descHe: "לוחמי STEM (מדעים מדויקים, הנדסה, מדעי החיים, אדריכלות) שנבצר מהם לגשת ל-2 מועדים בשל מילואים — זכאים למועד מיוחד תוך 30 יום מסיום השירות",
    descEn: "STEM combat students (exact sciences, engineering, life sciences, architecture) who couldn't take 2 exams due to service — eligible for special exam within 30 days of service end",
    deadlineDaysAfterService: 30,
    appliesTo: "combat_stem_only",
  },
  // Social involvement exemption — per official doc section 6
  SOCIAL_INVOLVEMENT_EXEMPTION: {
    credits: 2,                    // 2 ש"ס פטור (חוק מעורבות חברתית)
    descHe: "סטודנטים ממשיכים: 2 ש\"ס פטור בגין מילואים בתשפ\"ו (אם לא מימשו בעבר, ובתנאי שסה\"כ פטורי המלחמה ≤ 10 ש\"ס)",
    descEn: "Continuing students: 2 SH\"S exemption for reserve service in 5786 (if not used before, total war exemptions ≤ 10)",
    onlyIfNotUsedBefore: true,
    maxTotalWarExemptions: 10,
  },
  // Semester date ranges for classification — per official doc section 1
  SEMESTER_DATES_2026: {
    FALL: { start: "2025-10-26", end: "2026-03-13" },
    SPRING: { start: "2026-03-15", end: "2026-10-16" },
  },
  // Assignment mechanism — per official doc section 1
  ASSIGNMENT_MECHANISM: {
    descHe: "משרתי מילואים וקבע משויכים אוטומטית על בסיס נתוני הצבא (מתעדכנים כל שבועיים). אוכלוסיות אחרות מגישים בקשה במערכת 'חרבות ברזל — התאמות' מנובמבר",
    descEn: "Reservists and regular army are auto-assigned based on IDF data (updated biweekly). Others apply via 'Swords of Iron — Accommodations' system starting November",
  },
} as const;

// Amirnet (אמירנ"ט) / Psychometric English proficiency thresholds
// All tests (Amirnet, old AMIRAM, Psychometric English) use unified 50-150 scale
export const AMIRNET_CONFIG = {
  EXEMPT_THRESHOLD: 134,       // 134-150 = פטור — no language courses needed, still need 2 content courses
  ADVANCED_B_THRESHOLD: 120,   // 120-133 = מתקדמים ב' — 1 language + 2 content courses
  ADVANCED_A_THRESHOLD: 100,   // 100-119 = מתקדמים א' — 2 courses (TAU minimum admission level)
  BASIC_THRESHOLD: 85,         // 85-99 = בסיסי — 3 courses required
  // 50-84 = טרום בסיסי — 4-5 courses required (below TAU admission minimum)
  MIN_SCORE: 50,
  MAX_SCORE: 150,
  PPE_CONTENT_COURSES_REQUIRED: 2,  // PPE requires 2 academic courses in English regardless
} as const;

// Backwards-compatible alias
export const AMIRAM_CONFIG = AMIRNET_CONFIG;

// ────────────────────────────────────────────────────────────────────
// English (AMIRANT) placement → level mapping — נכון לתשפ"ו
// Official 50–150 scale. The LEVEL (preparatory) courses below are NOT
// counted in the 150 credits and NOT in the final grade — they are
// SEPARATE from the 2 English CONTENT courses (rule PKM-012).
// ────────────────────────────────────────────────────────────────────
export type EnglishLevel =
  | "PRE_BASIC"   // טרום בסיסי — auto-rejection
  | "BASIC"       // בסיסי
  | "ADVANCED_A"  // מתקדמים א'
  | "ADVANCED_B"  // מתקדמים ב'
  | "EXEMPT";     // פטור

export const ENGLISH_CONFIG = {
  // Score at/above which the student is exempt from LEVEL courses.
  EXEMPT_THRESHOLD: 134,
  // Passing grade for an English COURSE in the humanities faculty (where PPE sits)
  // is 70 — higher than the 60 used elsewhere. נכון לתשפ"ו.
  COURSE_PASSING_GRADE: 70,
  // Deadline to reach exemption (פטור): by the END of the 2nd semester, i.e.
  // year 1, semester B (SPRING). Past this without exemption → studies stop.
  EXEMPTION_DEADLINE_YEAR: 1,
  EXEMPTION_DEADLINE_SEMESTER: "SPRING" as const,
  // Score → level + number of remaining LEVEL (preparatory) courses.
  // Ordered high→low; first match wins.
  LEVELS: [
    { level: "EXEMPT" as EnglishLevel, minScore: 134, levelCourses: 0, nameHe: "פטור", nameEn: "Exempt" },
    { level: "ADVANCED_B" as EnglishLevel, minScore: 120, levelCourses: 1, nameHe: "מתקדמים ב׳", nameEn: "Advanced B" },
    { level: "ADVANCED_A" as EnglishLevel, minScore: 100, levelCourses: 2, nameHe: "מתקדמים א׳", nameEn: "Advanced A" },
    { level: "BASIC" as EnglishLevel, minScore: 85, levelCourses: 3, nameHe: "בסיסי", nameEn: "Basic" },
    { level: "PRE_BASIC" as EnglishLevel, minScore: 0, levelCourses: 4, nameHe: "טרום בסיסי", nameEn: "Pre-basic" },
  ],
} as const;

export interface EnglishLevelInfo {
  level: EnglishLevel;
  nameHe: string;
  nameEn: string;
  levelCourses: number;   // remaining preparatory LEVEL courses needed
  isExempt: boolean;
  isRejected: boolean;    // טרום בסיסי (≤84) — below admission minimum
}

/**
 * Map an AMIRANT score (50–150) to its English level + how many LEVEL
 * (preparatory) courses are still needed. Returns null for a null score
 * so callers can stay neutral (no rule firing). נכון לתשפ"ו.
 */
export function getEnglishLevel(score: number | null): EnglishLevelInfo | null {
  if (score == null) return null;
  const row =
    ENGLISH_CONFIG.LEVELS.find((l) => score >= l.minScore) ??
    ENGLISH_CONFIG.LEVELS[ENGLISH_CONFIG.LEVELS.length - 1]!;
  return {
    level: row.level,
    nameHe: row.nameHe,
    nameEn: row.nameEn,
    levelCourses: row.levelCourses,
    isExempt: row.level === "EXEMPT",
    isRejected: row.level === "PRE_BASIC",
  };
}

// Recommended credit load per semester (from official PKM guide 5786)
export const SEMESTER_CREDIT_GUIDANCE = {
  "1-FALL": { min: 23, max: 25 },
  "1-SPRING": { min: 27, max: 29 },
  "2-FALL": { min: 15, max: 30 },
  "2-SPRING": { min: 16, max: 30 },
  "3-FALL": { min: 12, max: 25 },
  "3-SPRING": { min: 10, max: 20 },
} as const;

// Economics seminar detailed rules (from official PKM guide)
export const ECON_SEMINAR_RULES = {
  FIRST_SESSION_MANDATORY: true,
  TOPIC_APPROVAL_MONTHS: 1,
  PAPERS_WRITTEN_IN_PAIRS: true,
} as const;

// Special exam period rules (Moed Meyuchad)
export const SPECIAL_EXAM_RULES = {
  REQUEST_AFTER_MOED_B_ONLY: true,
  DEADLINE_WEEKS_AFTER_GRADE: 2,
  DOCUMENTATION_REQUIRED: true,
} as const;

// File upload limits
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"] as const,
  ALLOWED_EXTENSIONS: [".pdf", ".docx", ".png", ".jpg", ".jpeg"] as const,
} as const;

// Navigation items (Round 13: simplified — exam/syllabus/calendar merged into dashboard tabs)
export const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", iconName: "LayoutDashboard" as const },
  { key: "planner", href: "/planner", iconName: "GraduationCap" as const },
  { key: "regulations", href: "/regulations", iconName: "Scale" as const },
  { key: "settings", href: "/settings", iconName: "Settings" as const },
] as const;
