// =========================================
// TAU PPE Program Definition — תשפ"ו (2025/2026)
// Single source of truth for all PPE-specific values.
// =========================================

import type { ProgramDefinition } from "../types";

export const TAU_PPE_2025: ProgramDefinition = {
  id: "tau-ppe-2025",
  universityId: "tau",
  programCode: "PPE",
  nameHe: 'פכ"מ',
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
      nameHe: 'פכ"מ ייעודי',
      nameEn: "PPE Core",
      minCredits: 29,
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
  // VERIFIED נכון לתשפ"ו: 150 = 103 mandatory (incl. PPE seminar) + 12 seminars + 35 electives.
  // The 103 mandatory splits 29 PPE-core + 18 philosophy + 27 economics + 15 polsci + 14 law.
  creditRequirements: {
    total: 150,
    mandatoryCredits: 103,
    seminarCredits: 12,
    electiveCredits: 35,
    focusAreaMin: 60,
    passingGrade: 56,
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
