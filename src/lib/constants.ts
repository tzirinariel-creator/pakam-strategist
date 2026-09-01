// =========================================
// Pakamon — Application Constants
// =========================================
// Program-specific values are derived from the active ProgramDefinition.
// Universal / UI config stays here directly.
// Downstream code imports the same names — zero changes needed.
// =========================================

import { getActiveProgram } from "@/lib/programs/registry";
import type { ProgramDefinition } from "@/lib/programs/types";

// Public contact address — ONE source of truth for every mailto in the app
// (footer, about/privacy/accessibility, settings feedback, catalog report).
// Points at an owner-controlled inbox until a real domain is bought; the
// pakamon.app domain was never registered, so a mailto there would leak
// inbound student mail to whoever claims it. When the domain lands, change
// this ONE line.
// 13.8 — switched from the personal gmail to the university address, at Ariel's
// request: this is where students write about bugs and suggestions, and a TAU
// address reads as "a student who built this", which is what the app claims to
// be. It also keeps his private inbox out of a public page.
export const CONTACT_EMAIL = "arieltzirin@mail.tau.ac.il";

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

// ── Module-level constants (resolved from the active program) ──
// A per-program factory layer (getDisciplineConfigFor(program) & friends) used
// to sit here for future multi-program support. Nothing ever called it, so it
// was removed; when a second program actually ships, re-derive these from the
// user's ProgramDefinition instead of getActiveProgram().

export const DISCIPLINE_CONFIG: Record<string, DisciplineDisplayConfig> =
  buildDisciplineConfig(getActiveProgram());

export const ALL_DISCIPLINE_IDS: string[] =
  getActiveProgram().disciplines.map((d) => d.id);

export const FOCUS_DISCIPLINE_IDS: string[] =
  getActiveProgram().disciplines.filter((d) => d.isFocusOption).map((d) => d.id);

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
  // here — read them off `program.disciplines[].minCredits`. This avoids
  // index-signature issues with noUncheckedIndexedAccess.
  return {
    TOTAL: program.creditRequirements.total,
    FOCUS_AREA_MIN: program.creditRequirements.focusAreaMin,
    ENGLISH_MIN_COURSES: program.creditRequirements.englishCourses,
    ENGLISH_MIN_CREDITS_PER_COURSE: 2,
    // Official נכון לתשפ"ו: 150 = 103 mandatory (incl. PPE seminar) + 12 seminars
    // + 35 electives. MANDATORY_TOTAL reads the program's mandatoryCredits, which
    // is pinned to 101 (the published catalog supply; the last 2 ש"ז is an
    // unpublished future PPE course — see tau-ppe-2025.ts).
    MANDATORY_TOTAL: program.creditRequirements.mandatoryCredits ?? 0,
    /** For DISPLAY in a breakdown that must sum to TOTAL. Never gate on this —
     *  gate on MANDATORY_TOTAL, which is what a student can actually earn from
     *  the published catalog. (#49) */
    MANDATORY_OFFICIAL:
      program.creditRequirements.officialMandatoryCredits ??
      program.creditRequirements.mandatoryCredits ??
      0,
    /** How much of MANDATORY_OFFICIAL has no published course yet. 0 when the
     *  official figure and the gate agree. */
    MANDATORY_UNPUBLISHED: program.creditRequirements.unpublishedMandatoryCredits ?? 0,
    SEMINAR_TOTAL: program.creditRequirements.seminarCredits ?? 0,
    ELECTIVE_TOTAL: program.creditRequirements.electiveCredits ?? 0,
    PRACTICE_ELECTIVE_MAX: 8,
    PRACTICE_COURSE_MAX_CREDITS: 4,
    PASSING_GRADE: program.creditRequirements.passingGrade,
    GRADUATION_MIN_SCORE: program.creditRequirements.graduationMinScore,
  } as const;
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
  } as const;
}

function buildGradeWeights(program: ProgramDefinition) {
  return {
    COURSES: program.gradeFormula.courseWeight,
    SEMINAR_PAPERS: program.gradeFormula.seminarWeight,
    REFERAT: program.gradeFormula.referatWeight,
  } as const;
}

// ── Module-level constants (resolved from the active program) ──
// A cached per-program getter layer (getCreditRequirementsFor(program) &
// friends) used to sit here for future multi-program support. Nothing ever
// called it — every one of the ~160 call sites in the app reads the constants
// below — so it was removed. When a second program actually ships, thread a
// ProgramDefinition through instead of adding the getters back unused.

export const CREDIT_REQUIREMENTS = buildCreditRequirements(getActiveProgram());

export const SEMINAR_REQUIREMENTS = buildSeminarRequirements(getActiveProgram());

export const GRADE_REQUIREMENTS = buildGradeRequirements(getActiveProgram());

export const GRADE_WEIGHTS = buildGradeWeights(getActiveProgram());

// Semester display config
export const SEMESTER_CONFIG = {
  FALL: { nameEn: "Fall (A)", nameHe: "סמסטר א׳", short: "א׳", shortEn: "Fall" },
  SPRING: { nameEn: "Spring (B)", nameHe: "סמסטר ב׳", short: "ב׳", shortEn: "Spring" },
  SUMMER: { nameEn: "Summer", nameHe: "סמסטר קיץ", short: "קיץ", shortEn: "Summer" },
} as const;

// (SEMESTER_TEACHING_DATES removed — teaching dates now live in
// src/lib/academic-calendar.ts, the verified single source of truth.)

// Year display config
export const YEAR_CONFIG = {
  1: { nameEn: "Year A", nameHe: "שנה א׳" },
  2: { nameEn: "Year B", nameHe: "שנה ב׳" },
  3: { nameEn: "Year C", nameHe: "שנה ג׳" },
} as const;

// ────────────────────────────────────────────────────────────────────
// Miluim (military reserve) accommodations — per official מתווה תשפ״ו
// Source: Official TAU document "מידע על מתווה מילואים תל אביב"
// Cross-referenced: February 2026
// ────────────────────────────────────────────────────────────────────
export const MILUIM_CONFIG = {
  // Credit exemption caps (ש״ס פטור) — per official doc section 3
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
      nameHe: "לא משרתים במילואים",
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
      creditExemptionPerYear: 2,   // 2 ש״ס — for NEW students with 10+ days
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
      nameHe: "קבוצה B — שירות של 21 עד 34 ימים בסמסטר",
      nameEn: "Group B — 21-34 days per semester",
      descHe: "שירות של 21–34 ימים בסמסטר. נכללים גם: לוחמים עם 14–20 ימים, מי שצבר 35+ ימים במהלך השנה, 60+ ימים לפני תחילת הסמסטר, או 100+ ימים בשנה הקודמת.",
      descEn: "21–34 days of service in a semester. Also included: combat soldiers with 14–20 days, anyone with 35+ cumulative days during the year, 60+ days before the semester starts, or 100+ days in the previous year.",
      criteria: "21-34 ימים/סמסטר | לוחמים 14-20 | 35+ בשנה | 60+ לפני סמסטר | 100+ בתשפ״ה",
      criteriaEn: "21-34 days/sem | combat 14-20 | 35+ in year | 60+ pre-semester | 100+ prev year",
      creditExemptionPerYear: 6,   // 6 ש״ס per year
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
        "2 קורסים בציון עובר/לא עובר בשנה (עד 5 בתואר, עד 10% מהש״ס)",
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
      nameHe: "קבוצה C — שירות של 35 ימים ומעלה בסמסטר",
      nameEn: "Group C — 35+ days per semester",
      descHe: "שירות של 35+ ימים בסמסטר (או 100+ ימים בסמסטר א׳ — שמזכה אוטומטית גם בסמסטר ב׳). לוחמים: כבר מ-21 ימים בסמסטר.",
      descEn: "35+ days of service in a semester (or 100+ days in semester A, which also grants Group C in semester B). Combat soldiers: from 21 days per semester.",
      criteria: "35+ ימים/סמסטר | 100+ בסמ׳ א׳→גם ב׳ | לוחמים: 21+",
      criteriaEn: "35+ days/sem | 100+ in sem A→also B | Combat: 21+",
      creditExemptionPerYear: 8,   // 8 ש״ס per year
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
        "פטור 8 ש״ס לקבוצה C (סה״כ עד 10 בתואר, בשילוב פטור נוסף של עד 2 ש״ס משנה אחרת)",
        "3 קורסים בציון עובר/לא עובר בשנה (עד 5 בתואר, עד 10% מהש״ס)",
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
      creditExemptionPerYear: 3,   // 3 ש״ס (new students only)
      binaryGradePerYear: 0,       // G's binary benefit is CREDIT-denominated, not per-year courses
      binaryGradeDegreeCap: 0,     // course-count caps don't apply to G —
      // the מתווה grants G "המרת עד 6 ש״ס לציון בינארי" (CREDITS, not courses —
      // pakam-domain-rules-2026 §Layer-B). Kept in a separate field so course-
      // count surfaces never over-promise; binaryBenefitOf() resolves the unit.
      // Was 0-everything until 14.7, which told bereaved-family students they
      // have NO benefit they legally hold.
      binaryCreditDegreeCap: 6,
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
  // Regular (non-combat) reservist per-semester thresholds (single source of
  // truth — deriveGroupFromDays reads these instead of hardcoding 35/21).
  // Per מתווה תשפ"ו: 35+ → C, 21–34 → B, 1–20 → A, 0 → NONE.
  REGULAR_RESERVIST: {
    perSemesterRules: [
      { minDays: 21, maxDays: 34, mappedGroup: "GROUP_B" as const },
      { minDays: 35, maxDays: Infinity, mappedGroup: "GROUP_C" as const },
    ],
  },
  // Combat soldier bonus: fighters get enhanced group mapping
  // Per official doc: לוחמים 14-20 → A, 21+ → C (per semester) or 21+ cumulative in year → B (sem B only)
  COMBAT_UPGRADE: {
    descHe: "לוחמים (ייעוד קדמי) — שיוך לקבוצה מיטיבה יותר",
    descEn: "Combat soldier (front-line designation) — mapped to enhanced group",
    perSemesterRules: [
      { minDays: 14, maxDays: 20, mappedGroup: "GROUP_B" as const, descHe: "14-20 ימים בסמסטר → קבוצה B" },
      { minDays: 21, maxDays: Infinity, mappedGroup: "GROUP_C" as const, descHe: "21+ ימים בסמסטר → קבוצה C" },
    ],
    yearCumulativeRules: [
      { minDays: 21, mappedGroup: "GROUP_B" as const, semester: "SPRING" as const, descHe: "21+ ימים מצטברים בשנת תשפ״ו → קבוצה B בסמ׳ ב׳ בלבד" },
    ],
  },
  // 300+ fighters — automatic C through degree completion
  // Per official doc: לוחמים ששירתו 300+ ימים מאז 7.10.23, כולל בני זוגם עם ילדים עד גיל 13
  FIGHTERS_300_PLUS: {
    nameHe: "לוחמים 300+ ימים",
    nameEn: "Fighter 300+ days since 7.10.23",
    descHe: "לוחמים שביצעו 300+ ימי מילואים בייעוד קדמי מאז 7.10.23 (בהיותם סטודנטים) — קבוצה C אוטומטית. כולל בני זוג עם ילדים עד גיל 13",
    descEn: "Combat fighter with 300+ reserve days since 7.10.23 (while enrolled) — automatic Group C. Includes spouses with children under 13",
    group: "GROUP_C" as const,
    minDaysSince7Oct: 300,
    includesSpouse: true, // spouse with children under 13 also gets C
  },
  // Spouse eligibility — per official doc section 2
  SPOUSE_RULES: {
    descHe: "בני זוג של משרתי מילואים (הורה לילדים עד גיל 13)",
    descEn: "Spouse of reservist (parent of children under 13)",
    maxChildAge: 13,
    // Spouse mirrors the serving partner's group under these conditions:
    groupB: "בני זוג ששירתו 21-34 ימים בסמסטר, או עמד בתנאי שירות ממושך (60+ ימים לפני סמסטר וכו')",
    groupC: "בני זוג ששירתו 35+ ימים בסמסטר",
  },
  // Retroactive rules — per official doc section 2
  RETROACTIVE: {
    descHe: "100+ ימים בתשפ״ה → קבוצה B בסמ׳ א׳ תשפ״ו (לסטודנטים פעילים בתשפ״ה)",
    descEn: "100+ days in 5785 → Group B in sem A 5786 (for students active in 5785)",
    prevYearMinDays: 100,
    grantedGroup: "GROUP_B" as const,
    grantedSemester: "FALL" as const,
    requiresActiveInPrevYear: true,
  },
  // Tuition fee exemptions — per official doc section 5
  TUITION: {
    dragging42: { daysRequired: 42, semestersExempt: 1, descHe: "42+ ימים מצטברים בתשפ״ו — פטור דמי גרירה סמסטר 1" },
    dragging84: { daysRequired: 84, semestersExempt: 2, descHe: "84+ ימים מצטברים בתשפ״ו — פטור דמי גרירה 2 סמסטרים" },
    dragging150: { daysRequired: 150, semestersExempt: 2, descHe: "150+ ימים מצטברים בתואר — פטור גרירה 2 סמסטרים (חוק זכויות הסטודנט, אין כפל מעבר ל-2)" },
    completionBenefit: {
      descHe: "קבוצה C + סיום חובות שמיעה בתשפ״ו + הגשת עבודה אחרונה עד 31/12/26 → פטור גרירה בתשפ״ז",
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
    credits: 2,                    // 2 ש״ס פטור (חוק מעורבות חברתית)
    descHe: "סטודנטים ממשיכים: 2 ש״ס פטור בגין מילואים בתשפ״ו (אם לא מימשו בעבר, ובתנאי שסה״כ פטורי המלחמה עד 10 ש״ס)",
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
 *
 * Internal on purpose: callers must go through `resolveEnglishLevel`, so a
 * declared level always wins over the score (#23).
 */
function getEnglishLevel(score: number | null): EnglishLevelInfo | null {
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

/**
 * Level → info directly, WITHOUT a score (#23). The official grade sheet prints
 * the English level as text ("מתקדמים ב'-מיון") with no number, so a student who
 * only knows their level — not their Amiram score — can still be placed. Returns
 * null for a null/unknown level so callers stay neutral.
 */
export function getEnglishLevelInfo(level: EnglishLevel | string | null): EnglishLevelInfo | null {
  if (!level) return null;
  const row = ENGLISH_CONFIG.LEVELS.find((l) => l.level === level);
  if (!row) return null;
  return {
    level: row.level,
    nameHe: row.nameHe,
    nameEn: row.nameEn,
    levelCourses: row.levelCourses,
    isExempt: row.level === "EXEMPT",
    isRejected: row.level === "PRE_BASIC",
  };
}

/**
 * The English level to trust (#23). A directly-declared level (from the grade
 * sheet or settings) ALWAYS wins over an Amiram score, because the sheet is the
 * university's own placement and the score is only a proxy for it. Falls back to
 * the score-derived level, then null.
 */
export function resolveEnglishLevel(
  englishLevel: EnglishLevel | string | null | undefined,
  amiramScore: number | null | undefined,
): EnglishLevelInfo | null {
  return getEnglishLevelInfo(englishLevel ?? null) ?? getEnglishLevel(amiramScore ?? null);
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

/**
 * The honest pass bar per course type — ENGLISH passes at 70, everything else
 * at 60. Lives HERE (not in grade-sheet.ts) so light UI components (course
 * card, record rows) can show the bar without dragging the whole scanner
 * module — and its zod dependency — into their client bundle (PERF1).
 */
export function passBarFor(courseType: string | undefined): number {
  return courseType === "ENGLISH"
    ? ENGLISH_CONFIG.COURSE_PASSING_GRADE
    : CREDIT_REQUIREMENTS.PASSING_GRADE;
}

// ────────────────────────────────────────────────────────────────────
// Public catalog size — the ONE place the marketing number lives.
//
// The landing page hardcoded "110+" in three separate strings (he.json,
// en.json, landing-page.tsx). After the תשפ״ז migration the catalog held 302
// courses and all three still said 110 — a wrong number on the public front
// page of a product whose entire promise is that it counts correctly, and a
// direct breach of the "never show a number without a source" rule.
//
// It is a constant rather than a live query because the landing page is a
// static public client component. Its source is the LIVE catalog:
//   npx tsx scripts/verify-catalog-facts.ts
// counts isActive courses and fails when this number drifts. Run it whenever
// the catalog is touched.
//
// The unit test cannot reach the database, so it only holds the FLOOR. That
// distinction is not pedantry: the test asserted equality with a frozen parse
// snapshot, stayed green for eight weeks, and the page printed 302 against a
// catalog of 304 the whole time. A guard aimed at the wrong source is worse
// than no guard, because it is believed.
// ────────────────────────────────────────────────────────────────────
export const CATALOG_COURSE_COUNT = 304;
