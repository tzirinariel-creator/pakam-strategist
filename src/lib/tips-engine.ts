// =========================================
// Tips & Fun Facts Engine
// =========================================
// Contextual tips and insider knowledge about the PPE program
// shown during planning, onboarding, and on dashboard.

import type { LucideIcon } from "lucide-react";
import {
  GraduationCap,
  BookOpen,
  Scale,
  TrendingUp,
  Target,
  Users,
  AlertTriangle,
  Clock,
  Lightbulb,
  FileText,
  Calculator,
  Globe,
  Shield,
  CheckCircle,
  Star,
  Brain,
  Landmark,
  CalendarDays,
  ClipboardCheck,
  ArrowUpRight,
  BadgeAlert,
  Ban,
  PenTool,
  BarChart3,
  Briefcase,
  Heart,
  Compass,
} from "lucide-react";

export interface Tip {
  id: string;
  textEn: string;
  textHe: string;
  category: "fun_fact" | "planning_tip" | "warning" | "motivation" | "academic_rule";
  icon: LucideIcon;
}

// -------------------------------------------
// Fun facts — real insider PPE knowledge
// -------------------------------------------
const FUN_FACTS: Tip[] = [
  {
    id: "ff-1",
    textEn: "Someone got 95 on their seminar paper and 70 on courses — their final score was 73. Courses count for 78%.",
    textHe: "שמעתם על מישהו שעשה 95 בסמינריון ו-70 בקורסים? ציון הגמר שלו 73. הקורסים שווים 78%.",
    category: "fun_fact",
    icon: Calculator,
  },
  {
    id: "ff-2",
    textEn: "PPE students study across 3 faculties — Social Sciences, Humanities, and Law. Each has its own office, rules, and vibe.",
    textHe: "בפכ\"מ לומדים ב-3 פקולטות שונות — חברה, רוח ומשפטים. כל אחת עם מזכירות, חוקים ואווירה אחרת.",
    category: "fun_fact",
    icon: Landmark,
  },
  {
    id: "ff-3",
    textEn: "150 credits in 3 years = ~25 per semester. But Year 1 is usually 23-25 in Fall and 27-29 in Spring.",
    textHe: "150 ש\"ס ב-3 שנים = בממוצע 25 לסמסטר. אבל בשנה א׳ בדרך כלל 23-25 בסמ׳ א׳ ו-27-29 בסמ׳ ב׳.",
    category: "fun_fact",
    icon: BarChart3,
  },
  {
    id: "ff-4",
    textEn: "Your focus area doesn't just affect your degree — it determines your civil service classification.",
    textHe: "תחום ההתמחות לא רק בשביל האקדמיה — הוא קובע את הסיווג שלכם בשירות המדינה.",
    category: "fun_fact",
    icon: Briefcase,
  },
  {
    id: "ff-5",
    textEn: "You can improve up to 2 course grades during your entire degree. Choose wisely which ones to retake.",
    textHe: "ניתן לשפר עד 2 ציונים במהלך כל התואר. תחשבו טוב איזה קורסים שווה לחזור עליהם.",
    category: "fun_fact",
    icon: TrendingUp,
  },
  {
    id: "ff-6",
    textEn: "The focus area requires 60 credits — that's 40% of your entire degree in one discipline.",
    textHe: "תחום ההתמחות דורש 60 ש\"ס — זה 40% מכל התואר בדיסציפלינה אחת.",
    category: "fun_fact",
    icon: Target,
  },
  {
    id: "ff-7",
    textEn: "Econ seminar papers are written in pairs. Find a good partner — it makes all the difference.",
    textHe: "עבודות סמינר בכלכלה נכתבות בזוגות. מצאו שותף/ה טוב/ה — זה עושה את ההבדל.",
    category: "fun_fact",
    icon: Users,
  },
  {
    id: "ff-8",
    textEn: "The Integrative Course in Year 2 is the only place where all three disciplines officially connect.",
    textHe: "הקורס האינטגרטיבי בשנה ב׳ הוא המקום היחיד שבו שלושת התחומים מתחברים רשמית.",
    category: "fun_fact",
    icon: Brain,
  },
  {
    id: "ff-9",
    textEn: "PPE is 30 credits more than a standard BA (120). That's basically a full extra year squeezed into 3.",
    textHe: "פכ\"מ זה 30 ש\"ס מעבר לתואר רגיל (120). בעצם שנה נוספת שלמה דחוסה ב-3.",
    category: "fun_fact",
    icon: GraduationCap,
  },
  {
    id: "ff-10",
    textEn: "You need 75 GPA overall and 80 in PPE courses to advance. If you got a low Moed A — don't skip Moed B.",
    textHe: "ממוצע מעבר שנה: 75 כללי + 80 בפכ\"מ. אם קיבלתם ציון נמוך במועד א׳ — אל תוותרו על מועד ב׳.",
    category: "fun_fact",
    icon: ArrowUpRight,
  },
];

// -------------------------------------------
// Planning tips — practical, specific advice
// -------------------------------------------
const PLANNING_TIPS: Tip[] = [
  {
    id: "pt-1",
    textEn: "Year 1 = mandatory courses. Don't get creative. Take all requirements and focus on a good GPA.",
    textHe: "שנה א׳ = חובות. אין מה להתחכם. קחו את כל קורסי החובה ותתמקדו בממוצע טוב.",
    category: "planning_tip",
    icon: ClipboardCheck,
  },
  {
    id: "pt-2",
    textEn: "Take English courses in Years 1-2 — easy credits that count toward 150 and relieve pressure later.",
    textHe: "קחו קורסי אנגלית בשנה א׳-ב׳ — ש\"ס קלות שנספרות ל-150 ומשחררות לחץ אחר כך.",
    category: "planning_tip",
    icon: Globe,
  },
  {
    id: "pt-3",
    textEn: "Before choosing a focus area, check how many credits you already have — you may have started without realizing.",
    textHe: "לפני שבוחרים תחום התמחות, בדקו כמה ש\"ס כבר צברתם — ייתכן שכבר התחלתם בלי לשים לב.",
    category: "planning_tip",
    icon: Compass,
  },
  {
    id: "pt-4",
    textEn: "Plan seminars early — not because of prerequisites, but because popular ones fill up fast.",
    textHe: "תכננו סמינריונים מוקדם — לא בגלל דרישות קדם, אלא כי המקומות נגמרים מהר.",
    category: "planning_tip",
    icon: CalendarDays,
  },
  {
    id: "pt-5",
    textEn: "Don't put 3 heavy courses (Math for PPE, Macro, Statistics) in the same semester.",
    textHe: "אל תשימו 3 קורסים כבדים (מתמטיקה לפכ\"מ, מאקרו, סטטיסטיקה) באותו סמסטר.",
    category: "planning_tip",
    icon: Scale,
  },
  {
    id: "pt-6",
    textEn: "Practice electives — max 8 credits total. They count toward 150 but not toward discipline minimums.",
    textHe: "קורסי עיון (משלב עשייה) — מקסימום 8 ש\"ס. נספרים ל-150 אבל לא לדרישות דיסציפלינה.",
    category: "planning_tip",
    icon: Lightbulb,
  },
];

// -------------------------------------------
// Warnings — things that can go wrong
// -------------------------------------------
const WARNINGS: Tip[] = [
  {
    id: "w-1",
    textEn: "More than 30 credits in a semester? Most students don't finish all their obligations. Think twice.",
    textHe: "יותר מ-30 ש\"ס בסמסטר? רוב הסטודנטים לא מסיימים את כל החובות. חשבו שוב.",
    category: "warning",
    icon: AlertTriangle,
  },
  {
    id: "w-2",
    textEn: "No courses yet? Start with Year 1 mandatory courses — they're prerequisites for everything else.",
    textHe: "עדיין בלי קורסים? התחילו מקורסי חובה של שנה א׳ — הם דרישת קדם לכל השאר.",
    category: "warning",
    icon: BookOpen,
  },
  {
    id: "w-3",
    textEn: "Failing the same course twice = game over. No third attempt. Invest in the first try.",
    textHe: "כשלון באותו קורס פעמיים = סוף הדרך. אין ניסיון שלישי. תשקיעו בפעם הראשונה.",
    category: "warning",
    icon: Ban,
  },
  {
    id: "w-4",
    textEn: "Failed once? Consult with an advisor before your second attempt. On retake, ALL obligations must be completed again.",
    textHe: "נכשלתם פעם אחת? התייעצו עם יועץ לפני הניסיון השני. בחזרה על קורס חובה להשלים הכול מחדש.",
    category: "warning",
    icon: BadgeAlert,
  },
  {
    id: "w-5",
    textEn: "Late seminar paper submission? Only with Teaching Committee approval. Don't assume anyone will cut you slack.",
    textHe: "עבודת סמינריון באיחור? רק עם אישור ועדת הוראה. אל תניחו שמישהו יעשה לכם הנחה.",
    category: "warning",
    icon: Clock,
  },
];

// -------------------------------------------
// Motivation — real, not generic
// -------------------------------------------
const MOTIVATION_TIPS: Tip[] = [
  {
    id: "m-1",
    textEn: "PPE grads work in policy, strategic consulting, diplomacy, law firms, and MBAs. This degree opens doors most can't.",
    textHe: "בוגרי פכ\"מ עובדים בקביעת מדיניות, ייעוץ אסטרטגי, דיפלומטיה, משרדי עו\"ד ו-MBA. התואר פותח דלתות שרוב התארים לא.",
    category: "motivation",
    icon: Briefcase,
  },
  {
    id: "m-2",
    textEn: "Every semester that passes = 25 more credits behind you. Look back and see how far you've come.",
    textHe: "כל סמסטר שעובר = עוד 25 ש\"ס מאחורי הגב. תסתכלו אחורה ותראו כמה התקדמתם.",
    category: "motivation",
    icon: Star,
  },
  {
    id: "m-3",
    textEn: "The hardest point is usually mid-Year 2. Those who push through that finish the degree.",
    textHe: "הרגע שהכי קשה הוא בדרך כלל אמצע שנה ב׳. מי שעובר את זה, מסיים את התואר.",
    category: "motivation",
    icon: Heart,
  },
];

// -------------------------------------------
// Academic rules — regulations worth knowing
// -------------------------------------------
const ACADEMIC_RULES: Tip[] = [
  {
    id: "ar-1",
    textEn: "Economics seminars: Year 3 only, max 2. First session attendance is mandatory — miss it and lose your spot.",
    textHe: "סמינרים בכלכלה: רק משנה ג׳, מקסימום 2. נוכחות בשיעור הראשון חובה — אי-הגעה = אובדן המקום.",
    category: "academic_rule",
    icon: Shield,
  },
  {
    id: "ar-2",
    textEn: "The law module: 14 credits from 10 foundation courses. Choose wisely — some are harder than others.",
    textHe: "מודול משפט: 14 ש\"ס מ-10 קורסי בסיס. בחרו בחוכמה — חלקם קשים יותר מאחרים.",
    category: "academic_rule",
    icon: Scale,
  },
  {
    id: "ar-3",
    textEn: "2 courses in English required (min 2 credits each). Any discipline counts.",
    textHe: "חובה 2 קורסים באנגלית (2 ש\"ס כ\"א לפחות). בכל תחום שתרצו.",
    category: "academic_rule",
    icon: Globe,
  },
  {
    id: "ar-4",
    textEn: "Reserve soldiers: up to 10 credit exemptions across the degree (2-8 per year depending on group).",
    textHe: "משרתי מילואים: עד 10 ש\"ס פטור לאורך כל התואר (2-8 בשנה לפי הקבוצה).",
    category: "academic_rule",
    icon: Shield,
  },
  {
    id: "ar-5",
    textEn: "Your 3 seminar papers = 18% of final grade. Referat = 4%. Together they're nearly a quarter of your score.",
    textHe: "3 עבודות סמינריוניות = 18% מהציון הסופי. רפרט = 4%. ביחד זה כמעט רבע מהציון.",
    category: "academic_rule",
    icon: FileText,
  },
  {
    id: "ar-6",
    textEn: "Year transition: 75 overall GPA + 80 in PPE courses. Below that = academic probation.",
    textHe: "מעבר שנה: ממוצע 75 כללי + 80 בפכ\"מ. מתחת לזה = התראה אקדמית.",
    category: "academic_rule",
    icon: ArrowUpRight,
  },
  {
    id: "ar-7",
    textEn: "Max 2 seminars with the same lecturer across the entire degree.",
    textHe: "מקסימום 2 סמינרים אצל אותו מרצה לאורך כל התואר.",
    category: "academic_rule",
    icon: Users,
  },
  {
    id: "ar-8",
    textEn: "You can appeal a grade within 5 days of publication.",
    textHe: "ניתן לערער על ציון תוך 5 ימים מפרסומו.",
    category: "academic_rule",
    icon: ClipboardCheck,
  },
  {
    id: "ar-9",
    textEn: "Prior studies recognition: minimum grade of 80 + Teaching Committee approval. Content must be equivalent.",
    textHe: "הכרה בלימודים קודמים: ציון מינימלי 80 + אישור ועדת הוראה. הקורס חייב להיות שקול בתוכן.",
    category: "academic_rule",
    icon: CheckCircle,
  },
  {
    id: "ar-10",
    textEn: "Same paper can't be submitted in more than one course. Late submissions only with Teaching Committee approval.",
    textHe: "אסור להגיש אותה עבודה ביותר מקורס אחד. הגשות מאוחרות רק באישור ועדת הוראה.",
    category: "academic_rule",
    icon: PenTool,
  },
  {
    id: "ar-11",
    textEn: "PPE students are exempt from the 'Guided Reading of Descartes' prerequisite for Intro to Modern Philosophy.",
    textHe: "סטודנטי פכ\"מ פטורים מדרישת הקדם ׳קריאה מודרכת של דקארט׳ למבוא לפילוסופיה חדשה.",
    category: "academic_rule",
    icon: BookOpen,
  },
  {
    id: "ar-12",
    textEn: "Special exam (Moed Meyuchad): request only after Moed B, within 2 weeks of grade publication, with documentation.",
    textHe: "מועד מיוחד: בקשה רק אחרי מועד ב׳, לא יאוחר משבועיים מפרסום הציון, חובה לצרף תיעוד.",
    category: "academic_rule",
    icon: CalendarDays,
  },
  {
    id: "ar-13",
    textEn: "Guided reading course counts as a seminar toward your requirements.",
    textHe: "קריאה מודרכת נחשבת כסמינר לצורך דרישות התואר.",
    category: "academic_rule",
    icon: BookOpen,
  },
  {
    id: "ar-14",
    textEn: "Final grade = Course avg (78%) + 3 seminar papers (18%) + 1 referat (4%).",
    textHe: "ציון סופי = ממוצע קורסים (78%) + 3 עבודות סמינריוניות (18%) + רפרט (4%).",
    category: "academic_rule",
    icon: Calculator,
  },
];

// All tips combined
export const ALL_TIPS: Tip[] = [...FUN_FACTS, ...PLANNING_TIPS, ...WARNINGS, ...MOTIVATION_TIPS, ...ACADEMIC_RULES];

/**
 * Get a random tip from a specific category
 */
export function getRandomTip(category?: Tip["category"]): Tip {
  const pool = category ? ALL_TIPS.filter((t) => t.category === category) : ALL_TIPS;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? ALL_TIPS[0]!;
}

/**
 * Get multiple random unique tips
 */
export function getRandomTips(count: number, category?: Tip["category"]): Tip[] {
  const pool = category ? ALL_TIPS.filter((t) => t.category === category) : ALL_TIPS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get contextual tips based on user state
 */
export function getContextualTips(state: {
  courseCount: number;
  totalCredits: number;
  hasFocusArea: boolean;
  currentYear: number;
  seminarCount: number;
}): Tip[] {
  const tips: Tip[] = [];

  // No courses — nudge to start
  if (state.courseCount === 0) {
    tips.push(WARNINGS.find((w) => w.id === "w-2")!);
    tips.push(PLANNING_TIPS.find((p) => p.id === "pt-1")!);
    tips.push(MOTIVATION_TIPS.find((m) => m.id === "m-1")!);
    return tips;
  }

  // Light load — add motivation
  if (state.totalCredits < 30) {
    tips.push(getRandomTip("motivation"));
  }

  // No focus area chosen
  if (!state.hasFocusArea) {
    tips.push(PLANNING_TIPS.find((p) => p.id === "pt-3")!);
  }

  // No seminars planned yet and in year 2+
  if (state.seminarCount === 0 && state.currentYear >= 2) {
    tips.push(PLANNING_TIPS.find((p) => p.id === "pt-4")!);
  }

  // Heavy credit load
  if (state.totalCredits > 18 * state.courseCount / 6) {
    tips.push(PLANNING_TIPS.find((p) => p.id === "pt-5")!);
  }

  // Always add a fun fact
  tips.push(getRandomTip("fun_fact"));

  // Filter out any undefined (safety)
  return tips.filter(Boolean);
}

/**
 * Get fun facts for onboarding (curated selection)
 */
export function getOnboardingFacts(): Tip[] {
  return [
    FUN_FACTS.find((f) => f.id === "ff-1")!,
    FUN_FACTS.find((f) => f.id === "ff-2")!,
    FUN_FACTS.find((f) => f.id === "ff-6")!,
    FUN_FACTS.find((f) => f.id === "ff-9")!,
    FUN_FACTS.find((f) => f.id === "ff-10")!,
  ];
}
