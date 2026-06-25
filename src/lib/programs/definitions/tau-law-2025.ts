// =========================================
// TAU Law (LLB) Program Definition — תשפ"ו (2025/2026)
// Buchmann Faculty of Law, Tel Aviv University
// =========================================
// Source: https://law.tau.ac.il/students-info2026toar1
// Source: https://en-law.tau.ac.il/LLB
// 141 credits, 3.5 years (7 semesters), ~40 mandatory first-year credits
// =========================================

import type { ProgramDefinition } from "../types";

export const TAU_LAW_2025: ProgramDefinition = {
  id: "tau-law-2025",
  universityId: "tau",
  programCode: "LAW",
  nameHe: "משפטים",
  nameEn: "Law (LLB)",
  fullNameHe: "הפקולטה למשפטים ע\"ש בוכמן",
  fullNameEn: "Buchmann Faculty of Law",
  academicYear: 2025,

  // ── Disciplines ──
  // Law studies don't have the same multi-discipline structure as PPE.
  // Instead: mandatory core → doctrinal electives → seminars/clinics.
  // We group electives by legal area for tracking & insights.
  disciplines: [
    {
      id: "LAW_MANDATORY",
      nameHe: "קורסי חובה",
      nameEn: "Mandatory",
      minCredits: 65,
      color: "#8B5CF6",
      isFocusOption: false,
    },
    {
      id: "PRIVATE_LAW",
      nameHe: "משפט פרטי",
      nameEn: "Private Law",
      minCredits: 0,
      color: "#F59E0B",
      isFocusOption: true,
    },
    {
      id: "PUBLIC_LAW",
      nameHe: "משפט ציבורי",
      nameEn: "Public Law",
      minCredits: 0,
      color: "#3B82F6",
      isFocusOption: true,
    },
    {
      id: "COMMERCIAL_LAW",
      nameHe: "משפט מסחרי",
      nameEn: "Commercial Law",
      minCredits: 0,
      color: "#10B981",
      isFocusOption: true,
    },
    {
      id: "CRIMINAL_LAW",
      nameHe: "משפט פלילי",
      nameEn: "Criminal Law",
      minCredits: 0,
      color: "#EF4444",
      isFocusOption: true,
    },
    {
      id: "INTERNATIONAL_LAW",
      nameHe: "משפט בינלאומי",
      nameEn: "International Law",
      minCredits: 0,
      color: "#6366F1",
      isFocusOption: true,
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
  creditRequirements: {
    total: 141,
    focusAreaMin: 0, // Law doesn't have a PPE-style focus area minimum
    passingGrade: 56,
    graduationMinScore: 60,
    englishCourses: 0, // Law handles English separately
    maxFailureRate: 0.3,
    maxExamAttempts: 3,
    yearTransitionGpa: 60,
  },

  // ── Seminars ──
  seminarRequirements: {
    totalPapers: 2, // 1 pro-seminar + 1 research seminar
    referats: 0,
  },

  // ── Grade Formula ──
  // Law uses a simpler weighted average — all courses weighted equally by credits
  gradeFormula: {
    courseWeight: 0.85,
    seminarWeight: 0.15,
    referatWeight: 0,
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
