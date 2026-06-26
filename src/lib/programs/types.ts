// =========================================
// ProgramDefinition — the heart of multi-degree support
//
// Every degree program = one ProgramDefinition.
// The code is generic; the data is specific.
// =========================================

/**
 * A single discipline within a degree program.
 * For PPE: Philosophy, Economics, Political Science, Law, PPE Core, General.
 * For a CS degree: might be Algorithms, Systems, AI, Math, General, etc.
 */
export interface DisciplineDefinition {
  id: string; // "PHILOSOPHY", "ECONOMICS", etc.
  nameHe: string; // "פילוסופיה"
  nameEn: string; // "Philosophy"
  minCredits: number; // minimum credits required
  color: string; // hex color for UI
  icon?: string; // optional Lucide icon name
  /** Can this discipline be chosen as a focus area? */
  isFocusOption: boolean;
}

/**
 * Seminar/paper requirements for the degree.
 */
export interface SeminarRequirements {
  totalPapers: number; // e.g., 3
  referats: number; // e.g., 1
  /** Which year can students start taking seminars? */
  earliestYear?: number;
  /** Special rules per discipline */
  disciplineRules?: {
    disciplineId: string;
    maxPerYear?: number;
    onlyFromYear?: number;
    inPairs?: boolean; // e.g., econ seminars in pairs
  }[];
}

/**
 * Grade calculation formula for final degree score.
 */
export interface GradeFormula {
  courseWeight: number; // e.g., 0.78
  seminarWeight: number; // e.g., 0.18
  referatWeight: number; // e.g., 0.04
}

/**
 * Feature flags — what capabilities are enabled for this program.
 */
export interface ProgramFeatures {
  /** Show military reserve (miluim) accommodations */
  miluim: boolean;
  /** Google Calendar export */
  googleCalendar: boolean;
  /** AI mentor chat */
  aiMentor: boolean;
  /** Exam date tracking */
  examDates: boolean;
}

/**
 * The complete definition of a degree program.
 * This is the single source of truth — all code reads from here.
 */
export interface ProgramDefinition {
  /** Unique ID: "tau-ppe-2026" */
  id: string;
  /** University: "tau" */
  universityId: string;
  /** Program code: "PPE" */
  programCode: string;
  /** Hebrew name: 'פכ"מ' */
  nameHe: string;
  /** English name: "PPE" */
  nameEn: string;
  /** Full Hebrew name: "פילוסופיה, כלכלה ומדע המדינה" */
  fullNameHe: string;
  /** Full English name: "Philosophy, Economics & Political Science" */
  fullNameEn: string;
  /** Academic year this definition applies to */
  academicYear: number;

  // ── Disciplines ──
  disciplines: DisciplineDefinition[];

  // ── Credit Requirements ──
  creditRequirements: {
    /** Total credits for graduation (e.g., 150) */
    total: number;
    /** Minimum credits in focus area discipline (e.g., 60) */
    focusAreaMin: number;
    /** Minimum passing grade (e.g., 60) */
    passingGrade: number;
    /** Minimum weighted score for graduation (e.g., 60) */
    graduationMinScore: number;
    /** Required English courses (e.g., 2) */
    englishCourses: number;
    /** Max failure rate before academic warning (e.g., 0.3 = 30%) */
    maxFailureRate: number;
    /** Max exam attempts per course (e.g., 3) */
    maxExamAttempts: number;
    /** Min overall GPA for year transition (e.g., 75) */
    yearTransitionGpa: number;
    /** Min major-specific GPA for year transition (e.g., 80, or null if not applicable) */
    yearTransitionMajorGpa?: number;
  };

  // ── Seminars ──
  seminarRequirements?: SeminarRequirements;

  // ── Grade Formula ──
  gradeFormula: GradeFormula;

  // ── Features ──
  features: ProgramFeatures;

  // ── University-level info ──
  university: {
    nameHe: string;
    nameEn: string;
    yedionBaseUrl?: string;
  };
}

// =========================================
// Helpers
// =========================================

/**
 * Get discipline definition by ID from a program.
 */
export function getDiscipline(
  program: ProgramDefinition,
  disciplineId: string
): DisciplineDefinition | undefined {
  return program.disciplines.find((d) => d.id === disciplineId);
}

/**
 * Get all discipline IDs that can be focus areas.
 */
export function getFocusOptions(program: ProgramDefinition): string[] {
  return program.disciplines
    .filter((d) => d.isFocusOption)
    .map((d) => d.id);
}

/**
 * Get the minimum credits for a specific discipline.
 * Returns 0 if discipline not found.
 */
export function getDisciplineMinCredits(
  program: ProgramDefinition,
  disciplineId: string
): number {
  return getDiscipline(program, disciplineId)?.minCredits ?? 0;
}
