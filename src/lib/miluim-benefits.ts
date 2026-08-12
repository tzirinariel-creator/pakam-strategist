// =========================================================================
// Miluim benefits — humanized, grouped, HONEST presentation.
//
// The "My benefits" window used to render a flat, machine-like checklist of
// terse official phrases (#7). This builds the SAME per-group entitlements as
// warm, categorized sentences that are honest about what the app does for you
// automatically vs. what you must request elsewhere.
//
// Every item is derived from the group's real config flags/numbers, so a
// Group-A student never sees a Group-C perk. The auto/informational split and
// the copy were produced by a code-grounded audit (each functional claim
// verified against the implementation) — notably: the app auto-applies the
// credit exemption and tracks the binary cap, while exam-time, 2-of-3 dates,
// bidding, attendance, etc. are university procedures the app only surfaces.
// The old "עד 10% מנ״ז" binary figure was dropped — it matched no tracked rule.
// =========================================================================

import type { MiluimGroupKey } from "./miluim";

export type BenefitCategory = "degree" | "exams" | "registration" | "learning";

export interface BenefitItem {
  he: string;
  en: string;
  /** The app actively applies or tracks this (shows an "auto" chip). */
  auto?: boolean;
}

export interface BenefitGroup {
  titleHe: string;
  titleEn: string;
  items: BenefitItem[];
}

/** The subset of a MILUIM_CONFIG group this builder reads. */
interface GroupCfg {
  creditExemptionPerYear: number;
  binaryGradeDegreeCap: number;
  /** G's binary benefit is CREDIT-denominated (עד 6 ש״ס) — see constants. */
  binaryCreditDegreeCap?: number;
  examChoice2of3: boolean;
  examTimeBonus: number;
  biddingBonus: number;
  homeworkShield: boolean;
  courseCancelNoCharge: boolean;
  prerequisiteFlexibility: boolean;
  attendanceExempt: boolean;
}

const CREDIT_DEGREE_CAP = 10;

// Membership for entitlements that have no dedicated config flag (free-text in
// the official מתווה). Kept here, code-grounded from the benefits audit, so the
// window shows each group exactly what it's owed.
const HAS_RECORDINGS: MiluimGroupKey[] = ["GROUP_A", "GROUP_B", "GROUP_C", "GROUP_G"];
const HAS_ASSIGNMENT_DEFERRAL: MiluimGroupKey[] = ["GROUP_B", "GROUP_C", "GROUP_G"];
const HAS_LATE_REGISTRATION: MiluimGroupKey[] = ["GROUP_B", "GROUP_C"];
const HAS_SPECIAL_ACCOMMODATIONS: MiluimGroupKey[] = ["GROUP_G"];
const HAS_DEAN_SUPPORT: MiluimGroupKey[] = ["GROUP_G"];

/**
 * Build the grouped, human benefit list for a miluim group. Empty categories
 * are dropped so the window only shows what actually applies.
 */
export function buildBenefitGroups(group: MiluimGroupKey, cfg: GroupCfg): BenefitGroup[] {
  const has = (list: MiluimGroupKey[]) => list.includes(group);

  const degree: BenefitItem[] = [];
  if (cfg.creditExemptionPerYear > 0) {
    degree.push({
      he: `פטור אוטומטי משעות סמסטריאליות — ${cfg.creditExemptionPerYear} ש״ס בשנה (עד ${CREDIT_DEGREE_CAP} בתואר). הפטור כבר בתוך ספירת הנקודות ובדיקת ההתקדמות שלכם, בלי שתצטרכו לעשות דבר.`,
      en: `Automatic semester-hours exemption — ${cfg.creditExemptionPerYear} credits/year (up to ${CREDIT_DEGREE_CAP} across the degree). It's already in your credit total and progress check, with nothing for you to do.`,
      auto: true,
    });
  }
  if (cfg.binaryGradeDegreeCap > 0) {
    degree.push({
      he: `קורסים בעובר/לא־עובר (בינארי) — עד ${cfg.binaryGradeDegreeCap} בתואר. פכמון סופר כמה מהן ניצלתם, מוציא אותן מהממוצע אוטומטית, ומתריע כשמתקרבים למכסה. את ההמרה עצמה מבצעים מול האוניברסיטה.`,
      en: `Pass/fail (binary) courses — up to ${cfg.binaryGradeDegreeCap} across the degree. Pakamon counts how many you've used, keeps them out of your GPA automatically, and warns as you near the cap. The conversion itself is done through the university.`,
      auto: true,
    });
  } else if ((cfg.binaryCreditDegreeCap ?? 0) > 0) {
    // Group G — the מתווה grants the benefit in CREDITS, not courses.
    degree.push({
      he: `המרת קורסים לעובר/לא־עובר (בינארי) — עד ${cfg.binaryCreditDegreeCap} ש״ס בתואר. פכמון סוכם את הש״ס של הקורסים שסימנתם כבינארי ומתריע כשמתקרבים למכסה. את ההמרה עצמה מבצעים מול האוניברסיטה.`,
      en: `Pass/fail (binary) conversion — up to ${cfg.binaryCreditDegreeCap} CREDITS across the degree. Pakamon sums the credits of courses you marked binary and warns near the cap. The conversion itself is done through the university.`,
      auto: true,
    });
  }

  const exams: BenefitItem[] = [];
  if (cfg.examChoice2of3) {
    exams.push({
      he: "בחירת 2 מתוך 3 מועדי בחינה, והציון הגבוה נקבע. מתבצע מול המזכירות או מדור הבחינות — פכמון לא מבצע את זה בשבילכם.",
      en: "Sit 2 of 3 exam dates, with the higher grade counting. Arranged through the secretariat or exams office — Pakamon doesn't compute this for you.",
    });
  }
  if (cfg.examTimeBonus > 0) {
    exams.push({
      he: `${cfg.examTimeBonus}% תוספת זמן בבחינות (עד 50% בשילוב התאמות אחרות). מבקשים מהמזכירות או ממדור הבחינות.`,
      en: `${cfg.examTimeBonus}% extra exam time (up to 50% combined with other accommodations). Request it from the secretariat or exams office.`,
    });
  }
  if (cfg.homeworkShield) {
    exams.push({
      he: "אם ציון מטלות הבית גבוה מציון המבחן — הגבוה נקבע (רשת ביטחון). מממשים מול המרצה או המזכירות; פכמון לא עוקב אחר ציוני המטלות.",
      en: "If your homework grade beats your exam grade, the higher one counts (a safety net). Realize it with the lecturer or department — Pakamon doesn't track homework grades.",
    });
  }

  const registration: BenefitItem[] = [];
  if (cfg.biddingBonus > 0) {
    registration.push({
      he: `+${cfg.biddingBonus}% נקודות בידינג לרישום לקורסים. התוספת מיושמת במערכת הרישום של האוניברסיטה.`,
      en: `+${cfg.biddingBonus}% bidding points for course registration. Applied by the university's registration system.`,
    });
  }
  if (cfg.courseCancelNoCharge) {
    registration.push({
      he: "ביטול רישום לקורס ללא חיוב, כל עוד לא נבחנת. הביטול וההחזר מתבצעים מול האוניברסיטה.",
      en: "Cancel a course registration free of charge, as long as you didn't sit the exam. The cancellation and refund are handled by the university.",
    });
  }
  if (cfg.prerequisiteFlexibility) {
    registration.push({
      he: "גמישות בדרישות קדם, אם לקחת קורס־קדם ולא עברת אותו. מיושם ישירות מול המחלקה.",
      en: "Flexibility on prerequisites if you took a prerequisite and didn't pass it. Handled directly with the department.",
    });
  }
  if (has(HAS_LATE_REGISTRATION)) {
    registration.push({
      he: "רישום מאוחר לקורסים — מגישים בקשה לדיקנט הסטודנטים.",
      en: "Late course registration — request it from the Dean of Students.",
    });
  }
  if (has(HAS_ASSIGNMENT_DEFERRAL)) {
    registration.push({
      he: "דחיית הגשת עבודות — מתאמים מול המרצה או המזכירות.",
      en: "Extensions on assignment submissions — arrange with the lecturer or department.",
    });
  }

  const learning: BenefitItem[] = [];
  if (cfg.attendanceExempt) {
    learning.push({
      he: "פטור מחובת נוכחות (למעט סדנאות וקורסים מעשיים). הנוכחות בניהול המרצים ודיקנט הסטודנטים.",
      en: "Exemption from mandatory attendance (except workshops and practical courses). Attendance stays with instructors and the Dean.",
    });
  }
  if (has(HAS_RECORDINGS)) {
    learning.push({
      he: "הקלטות הרצאות והנגשת חומרי לימוד. זכאות שמנוהלת בצד האוניברסיטה.",
      en: "Lecture recordings and accessible study materials. An entitlement managed on the university side.",
    });
  }
  if (has(HAS_SPECIAL_ACCOMMODATIONS)) {
    learning.push({
      he: "התאמות אקדמיות מיוחדות ופרטניות — מנוהלות ישירות על ידי דיקנט הסטודנטים.",
      en: "Special, individual academic accommodations — administered directly by the Dean of Students.",
    });
  }
  if (has(HAS_DEAN_SUPPORT)) {
    learning.push({
      he: "ליווי אישי מדיקנט הסטודנטים — פונים ישירות לדיקנט.",
      en: "Personal support from the Dean of Students — reach out to the Dean directly.",
    });
  }

  return [
    { titleHe: "בתואר ובציונים", titleEn: "Your degree & grades", items: degree },
    { titleHe: "בבחינות", titleEn: "In exams", items: exams },
    { titleHe: "ברישום לקורסים", titleEn: "Registering for courses", items: registration },
    { titleHe: "בלמידה ובליווי", titleEn: "Learning & support", items: learning },
  ].filter((g) => g.items.length > 0);
}

/** The honest "how this works" footer — auto vs. request-elsewhere. */
export const BENEFITS_HONESTY_NOTE = {
  he: 'ההטבות המסומנות "אוטומטי" מיושמות עבורכם בתוך פכמון — הפטור משעות והמעקב אחר קורסים בינאריים כבר בתוך ספירת הנקודות והממוצע, בלי שתעשו דבר. שאר ההטבות הן זכויות אמיתיות שלכם, אבל את מימושן מבקשים במקום הנכון: בחינות ותוספת זמן מול המזכירות או מדור הבחינות, ורישום מאוחר, דחיות וליווי אישי מול דיקנט הסטודנטים.',
  en: 'The benefits marked "auto" are applied for you inside Pakamon — the credit exemption and binary tracking are already in your credit count and GPA, with nothing to do. The rest are real entitlements you realize in the right place: exams and extra time through the secretariat or exams office, and late registration, deferrals and personal support through the Dean of Students.',
};
