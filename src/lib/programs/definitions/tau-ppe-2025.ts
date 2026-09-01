// =========================================
// TAU PPE Program Definition — תשפ"ו (2025/2026)
// Single source of truth for all PPE-specific values.
// =========================================

import type { ProgramDefinition } from "../types";

export const TAU_PPE_2025: ProgramDefinition = {
  id: "tau-ppe-2025",
  universityId: "tau",
  programCode: "PPE",
  nameHe: 'פכ״מ',
  nameEn: "PPE",
  fullNameHe: "פילוסופיה, כלכלה ומדע המדינה",
  fullNameEn: "Philosophy, Economics & Political Science",
  academicYear: 2025,

  // ── Disciplines ──
  disciplines: [
    {
      id: "PHILOSOPHY",
      nameHe: "פילוסופיה",
      nameEn: "Philosophy",
      minCredits: 18,
      color: "#4A90D9",
      isFocusOption: true,
    },
    {
      id: "ECONOMICS",
      nameHe: "כלכלה",
      nameEn: "Economics",
      minCredits: 27,
      color: "#2ECC71",
      isFocusOption: true,
    },
    {
      id: "POLITICAL_SCIENCE",
      nameHe: "מדע המדינה",
      nameEn: "Political Science",
      minCredits: 15,
      color: "#E74C3C",
      isFocusOption: true,
    },
    {
      id: "LAW",
      nameHe: "משפטים",
      nameEn: "Law",
      minCredits: 14,
      color: "#F39C12",
      isFocusOption: false,
    },
    {
      id: "PPE_CORE",
      nameHe: 'פכ״מ ייעודי',
      nameEn: "PPE Core",
      // Official PPE-dedicated requirement is 29 ש"ז, but that figure is met only
      // once the student layers elective/seminar PPE_CORE courses on top of the
      // mandatory core. The PUBLISHED catalog supplies exactly 13 PPE_CORE ש"ז of
      // MANDATORY credit a complete student is guaranteed to earn:
      //   9 (4 PPE_CORE mandatory courses) + 4 (PPE seminar 0651-3001) = 13.
      // The would-be 15 is short by 2 ש"ז — the unpublished future PPE course
      // (domain rules §9b: "עתיד להתווסף קורס ייעודי נוסף של 2-4 ש״ס"). We pin the
      // DISC-PPE_CORE minimum to what the catalog actually delivers (13) so a
      // doc-correct COMPLETE plan reconciles instead of permanently red-flagging
      // students for credits no published course can supply. Revisit when TAU
      // publishes the missing course.
      // The gate stays 13 (what the catalog delivers); the PUBLISHED figure is
      // 29, and the overview card must show that one or its five discipline
      // rows sum to 87 directly under a 103 headline — the same arithmetic
      // Ariel caught at the top of the very same card (#49).
      officialMinCredits: 29,
      minCredits: 13,
      color: "#6B7280",
      isFocusOption: false,
    },
    {
      id: "GENERAL",
      nameHe: "כללי",
      nameEn: "General",
      minCredits: 0,
      color: "#8B949E",
      isFocusOption: false,
    },
  ],

  // ── Credit Requirements ──
  // Official נכון לתשפ"ו: 150 = 103 mandatory (incl. PPE seminar) + 12 seminars + 35 electives.
  // The 103 mandatory splits 29 PPE-core + 18 philosophy + 27 economics + 15 polsci + 14 law.
  //
  // mandatoryCredits is pinned to 101, NOT the official 103: a doc-correct
  // COMPLETE plan earns 89 (MANDATORY courses) + 4 (PPE seminar 0651-3001) +
  // 8 (the "pick any two" LAW_FOUNDATION basket) = 101 mandatory ש"ז from the
  // PUBLISHED catalog. The remaining 2 ש"ז is an unpublished future PPE course
  // (domain rules §9b: "עתיד להתווסף קורס ייעודי נוסף של 2-4 ש״ס") — no catalog
  // course can supply it yet, so requiring 103 permanently red-flags a complete
  // student. Revisit when TAU publishes the missing 2-ש"ז PPE course.
  creditRequirements: {
    total: 150,
    // What the app REQUIRES of a student (the gate).
    //
    // MEASURED against the live catalog, not assumed: active courseType
    // MANDATORY = 24 courses / 85 ש״ס, the mandatory PPE seminar 0651-3001 = 4,
    // and the LAW_FOUNDATION basket caps at 8. Maximum a student can actually
    // earn today = 97.
    //
    // This was pinned at 101 on the reasoning in the comment above, and the
    // supply had since fallen below it — two MANDATORY courses are marked
    // isActive:false in the תשפ״ז migration (1411-9240 משפט וכלכלה, 2 ש״ס, which
    // the domain rules name as a fixed part of the 14-credit law division, and
    // PHIL-READING שיעור קריאה או יסוד בפילוסופיה, 2 ש״ס).
    //
    // The consequence was not cosmetic. A third-year who had completed every
    // published mandatory course was told "נקודות חובה לא מספיקות: 97/101 —
    // חסרות 4 ש״ס", the all-mandatory-complete rule could never fire, and the
    // seminar rule told that same student "הרישום לסמינר דורש ציון עובר בכל
    // קורסי החובה… נותרו 4 ש״ס חובה" — the app asserting they were ineligible
    // to register for a seminar they were eligible for, and the advisor
    // repeating it. A gate above the supply is a gate no one can pass.
    //
    // OWNER DECISION PENDING (Ariel): whether those two courses are still
    // mandatory in תשפ״ז. If they are, reactivate them and this returns to 101.
    // Until that is checked against the ידיעון, the gate must not exceed what a
    // student can earn.
    mandatoryCredits: 97,
    // What the ידיעון SAYS (the published figure). Ariel, #49: "זה לא מגיע ל-150
    // אפילו.. אתה סגור על מה שכתוב כאן?" He is right — the overview card printed
    // 150 as a headline over 101 + 35 + 12, which is 148, and an app that cannot
    // add its own numbers is an app whose other numbers you stop trusting.
    //
    // Both figures are real and they are not the same claim, so the app now
    // holds both: the official split is what it DISPLAYS, and the 101 gate is
    // what it CHECKS — with the two missing credits named out loud rather than
    // quietly dropped.
    officialMandatoryCredits: 103,
    /** The published figure minus what the active catalog can supply. Shown to
     *  the student so 103 / 35 / 12 still sums to 150 and the gap is explained
     *  rather than silently dropped. */
    unpublishedMandatoryCredits: 6,
    seminarCredits: 12,
    electiveCredits: 35,
    focusAreaMin: 60,
    passingGrade: 60,
    graduationMinScore: 60,
    englishCourses: 2,
    maxFailureRate: 0.3,
    maxExamAttempts: 3,
    yearTransitionGpa: 75,
    yearTransitionMajorGpa: 80,
  },

  // ── Seminars ──
  seminarRequirements: {
    totalPapers: 3,
    referats: 1,
    disciplineRules: [
      {
        disciplineId: "ECONOMICS",
        maxPerYear: 2,
        onlyFromYear: 3,
        inPairs: true,
      },
    ],
  },

  // ── Grade Formula ──
  gradeFormula: {
    courseWeight: 0.78,
    seminarWeight: 0.18,
    referatWeight: 0.04,
  },

  // ── Features ──
  features: {
    miluim: true,
    googleCalendar: true,
    aiMentor: true,
    examDates: true,
  },

  // ── University ──
  university: {
    nameHe: "אוניברסיטת תל אביב",
    nameEn: "Tel Aviv University",
    yedionBaseUrl: "https://ims.tau.ac.il/tal",
  },
};
