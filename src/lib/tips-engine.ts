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
    // Arithmetic honors the real formula: 0.78×70 + 0.18×90 + 0.04×80 = 74.0
    textEn: "Someone got 90 on seminars, 80 on the referat — and 70 on courses. Final score: 74. Courses count for 78%.",
    textHe: "מישהו עשה 90 בסמינריונים, 80 ברפרט — ו-70 בקורסים. ציון הגמר: 74. הקורסים שווים 78%.",
    category: "fun_fact",
    icon: Calculator,
  },
  {
    id: "ff-2",
    // Said "3 פקולטות — חברה, רוח ומשפטים" and named Law as the third. It is
    // not one: TAU's Law faculty is a separate faculty that PPE students do not
    // belong to. The programme's own page files it under two faculties
    // (go.tau.ac.il/he/humanities/ba/pacam breadcrumbs: הפקולטה למדעי הרוח >
    // הפקולטה למדעי החברה) and calls the law part "לימודי יסוד במשפטים".
    // A student who went looking for a third secretariat would not find one.
    textEn: "PPE students study across two faculties, Social Sciences and Humanities, plus foundational law studies. Each faculty has its own office, rules, and vibe.",
    textHe: "בפכ״מ לומדים בשתי פקולטות, חברה ורוח, ולצידן לימודי יסוד במשפטים. לכל פקולטה מזכירות, חוקים ואווירה משלה.",
    category: "fun_fact",
    icon: Landmark,
  },
  {
    id: "ff-3",
    textEn: "150 credits in 3 years = ~25 per semester. But Year 1 is usually 23-25 in Fall and 27-29 in Spring.",
    textHe: "150 ש״ס ב-3 שנים = בממוצע 25 לסמסטר. אבל בשנה א׳ בדרך כלל 23-25 בסמ׳ א׳ ו-27-29 בסמ׳ ב׳.",
    category: "fun_fact",
    icon: BarChart3,
  },
  {
    id: "ff-4",
    textEn: "Your focus area doesn't just affect your degree — it determines your civil service classification.",
    textHe: "תחום המיקוד לא רק בשביל האקדמיה — הוא קובע את הסיווג שלכם בשירות המדינה.",
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
    textHe: "תחום המיקוד דורש 60 ש״ס — זה 40% מכל התואר בדיסציפלינה אחת.",
    category: "fun_fact",
    icon: Target,
  },
  {
    id: "ff-7",
    textEn: "Econ seminar papers are written in pairs. Find a good partner — it makes all the difference.",
    textHe: "עבודות סמינר בכלכלה נכתבות בזוגות. מצאו שותפים טובים — זה עושה את ההבדל.",
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
    textHe: "פכ״מ זה 30 ש״ס מעבר לתואר רגיל (120). בעצם שנה נוספת שלמה דחוסה ב-3.",
    category: "fun_fact",
    icon: GraduationCap,
  },
  {
    id: "ff-10",
    textEn: "You need 75 GPA overall and 80 in PPE courses to advance. If you got a low Moed A — don't skip Moed B.",
    textHe: "ממוצע מעבר שנה: 75 כללי + 80 בפכ״מ. אם קיבלתם ציון נמוך במועד א׳ — אל תוותרו על מועד ב׳.",
    category: "fun_fact",
    icon: ArrowUpRight,
  },
  // The four below are computed from OUR OWN catalog (the same rows the course
  // list renders), so a student who doubts one can go and count. That is the
  // difference between a fact and a flourish — and after the career line above,
  // it is the standard every card on this surface has to meet.
  {
    id: "ff-11",
    // Was "only 9 of 302 courses have prerequisites" — a report on a column in
    // OUR database, not on the degree, and it missed the far stronger rule the
    // Yedion actually states. Sourced: docs/pakam-domain-rules-2026.md §9b,
    // quoting Yedion note 19 — "תלמידי פכ״ם אינם מחוייבים בדרישות הקדם" — and
    // the seminar gate from the same section. Neither number moves with the
    // catalog, because neither is a number.
    textEn: "The Yedion exempts PPE students from course prerequisites. The one real gate is seminars: they need a passing grade in every mandatory course first.",
    textHe: "הידיעון פוטר את תלמידי פכ״מ מדרישות הקדם. השער האמיתי היחיד הוא הסמינרים: אליהם נרשמים רק עם ציון עובר בכל קורסי החובה.",
    category: "fun_fact",
    icon: Compass,
  },
  {
    id: "ff-12",
    textEn: "67 of the courses on offer are seminars — you need 3. There is a lot of room to pick ones you actually want.",
    textHe: "67 מהקורסים שנלמדים הם סמינרים — ואתם צריכים 3. יש הרבה מקום לבחור משהו שבאמת מעניין אתכם.",
    category: "fun_fact",
    icon: PenTool,
  },
  {
    id: "ff-13",
    textEn: "The heaviest courses in the degree are 6 credits each: Macroeconomics, Introduction to Econometrics, and Foundations of Finance.",
    textHe: "הקורסים הכבדים ביותר בתואר הם 6 ש״ס כל אחד: מאקרו כלכלה, מבוא לאקונומטריקה, ויסודות המימון.",
    category: "fun_fact",
    icon: BarChart3,
  },
  {
    id: "ff-14",
    textEn: "The catalog spans six fields, not three: alongside philosophy, economics and political science there are law courses, PPE core courses, and general electives.",
    textHe: "הקטלוג פרוש על שישה תחומים, לא שלושה: לצד פילוסופיה, כלכלה ומדע המדינה יש גם קורסי משפטים, קורסי ליבה של פכ״מ, ובחירה כללית.",
    category: "fun_fact",
    icon: Landmark,
  },
  {
    id: "ff-18",
    // Counted off the parsed exam board, src/data/yedion-5787-assessments.json:
    // 134 DISTINCT course codes carry a "בחינה סופית", every one of them with
    // exactly two sittings, and the median A→B gap over those 134 is 35 days.
    // (The raw file holds 269 such records — one per group — so counting rows
    // instead of courses would double it.)
    textEn: "All 134 courses with a final exam in the 5787 Yedion get exactly two sittings. The median gap between Moed A and Moed B is 35 days.",
    textHe: "לכל אחד מ-134 הקורסים עם בחינה סופית בידיעון תשפ״ז יש בדיוק שני מועדים. חציון המרווח בין מועד א׳ למועד ב׳ הוא 35 יום.",
    category: "fun_fact",
    icon: CalendarDays,
  },
  {
    id: "ff-22",
    // All four numbers are read from the program definition, not estimated:
    // programs/definitions/tau-ppe-2025.ts — focusAreaMin 60, and the mandatory
    // core's ECONOMICS 27 / PHILOSOPHY 18 / POLITICAL_SCIENCE 15.
    textEn: "A focus area is 60 credits in one discipline, and the mandatory core already covers part of it: 27 credits in economics, 18 in philosophy, 15 in political science. The gap left to fill is not the same in all three.",
    textHe: "תחום מיקוד דורש 60 ש״ס בתחום אחד, וקורסי החובה כבר מכסים חלק מהם: 27 ש״ס בכלכלה, 18 בפילוסופיה ו-15 במדע המדינה. הפער שנשאר לכם להשלים לא זהה בשלושת התחומים.",
    category: "fun_fact",
    icon: Target,
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
    textEn: "It's worth taking your English courses early (Years 1-2): they're relatively easy, count toward the degree, and ease your load later.",
    textHe: "כדאי לקחת את קורסי-האנגלית כבר בשנה א׳–ב׳: הם קלים יחסית, נספרים לתואר, ומורידים עומס בהמשך.",
    category: "planning_tip",
    icon: Globe,
  },
  {
    id: "pt-3",
    textEn: "Your focus area needs 60 credits. Before deciding, see which disciplines you already have courses in — pick one where you're already building momentum.",
    textHe: "תחום המיקוד דורש 60 ש״ס. לפני שבוחרים — בדקו באילו תחומים כבר צברתם קורסים, ובחרו תחום שכבר יש לכם בו תאוצה.",
    category: "planning_tip",
    icon: Compass,
  },
  {
    id: "pt-4",
    // The old copy said "not because of prerequisites" — the exact opposite of
    // the ידיעון rule (domain §9b): PPE is exempt from per-course prerequisites,
    // but EVERY seminar requires a passing grade in ALL mandatory courses first
    // (rule PKM-027). A tip must never contradict a gate the מזכירות enforces.
    textEn: "Seminars need a passing grade in every mandatory course before you can register — plan them after the mandatory load, and early, because popular ones fill up fast.",
    textHe: "רישום לסמינר דורש ציון עובר בכל קורסי החובה — תכננו אותם אחרי עומס החובה, ומוקדם, כי המקומות נגמרים מהר.",
    category: "planning_tip",
    icon: CalendarDays,
  },
  {
    id: "pt-5",
    // Ariel, #53: "זאת אמירה כל כך גרועה… כי זה קורסי חובה בכל מיני סמסטרים אז
    // זה מראה שאתה מחשב ומנותק."
    //
    // He is right, and it is checkable: the three courses this named are placed
    // by the curriculum in three different semesters — מתמטיקה לפכ״מ in year 1
    // fall, סטטיסטיקה לפכ״מ in year 1 spring, מאקרו כלכלה in year 2 fall. They
    // cannot be stacked. The app was warning a student against a collision its
    // own catalog makes impossible, about courses it places for them and the
    // planner locks.
    //
    // Advice a student cannot act on is worse than no advice: it is the app
    // demonstrating it does not know what it just did. What IS in their hands is
    // how much elective load they add on top of a mandatory semester — so that
    // is what this now says, with no invented threshold.
    textEn: "Mandatory courses are already placed in their semesters — what you control is how many electives you add on top. Check the recommended credit range for the semester before adding more.",
    textHe: "קורסי החובה כבר משובצים לסמסטרים שלהם — מה שבידיים שלכם זה כמה בחירה להוסיף מעליהם. שווה להציץ בטווח הש״ס המומלץ לסמסטר לפני שמוסיפים עוד.",
    category: "planning_tip",
    icon: Scale,
  },
  {
    id: "pt-6",
    textEn: "Practice electives — max 8 credits total. They count toward 150 but not toward discipline minimums.",
    textHe: "קורסי עיון (משלב עשייה) — מקסימום 8 ש״ס. נספרים ל-150 אבל לא לדרישות דיסציפלינה.",
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
    textHe: "יותר מ-30 ש״ס בסמסטר? רוב הסטודנטים לא מסיימים את כל החובות. חשבו שוב.",
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
    textEn: "Fail the same course twice and you can't retake it — there is no third attempt. Make the first try count.",
    textHe: "כישלון באותו קורס פעמיים — לא ניתן לחזור עליו, אין מועד שלישי. כדאי להשקיע כבר בפעם הראשונה.",
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
    // Ariel, 1.9: "יש שם שטויות וטעויות. איזה משרד עורכי דין? על מה אתה מדבר?"
    //
    // He is right, and the previous rewrite of this line missed the actual
    // problem. It read: "בוגרי פכ״מ עובדים בקביעת מדיניות, בייעוץ אסטרטגי,
    // בדיפלומטיה ובמשרדי עורכי דין — ורבים ממשיכים ל-MBA." Every clause in it
    // is a claim about graduate outcomes that WE HAVE NO SOURCE FOR. Nobody
    // surveyed the graduates; the sentence was written because it sounded like
    // the sort of thing such a page says. That is exactly the "אין נתון בלי
    // מקור" rule, broken in the one place a student is most likely to believe
    // it — a card that presents itself as a fact.
    //
    // The first replacement was 302 courses / 25 mandatory / 89 credits — three
    // numbers read off our own catalog. Within eight weeks all three were
    // false: the catalog holds 304 active courses, and reactivating two
    // mandatory courses on 2.9 moved 25→27 and 89→93. A fact that has to be
    // re-verified every time the catalog moves is a false fact waiting for its
    // turn, and this card is the one place a student is most likely to believe
    // us.
    //
    // So this states something the catalog cannot move, sourced to the
    // programme's own page: go.tau.ac.il/he/humanities/ba/pacam — "בישראל, רק
    // אוניברסיטת תל אביב משלבת את תוכנית ההצטיינות בפכ״מ עם לימודי יסוד
    // במשפטים". The 14 ש״ס is ours and is pinned twice:
    // programs/definitions/tau-ppe-2025.ts (LAW minCredits) and
    // docs/pakam-domain-rules-2026.md §1.
    //
    // Wording keeps the source's own verb (משלב) and the app's own name for
    // the division (חטיבת המשפט, as in ar-2) — a third name for one thing is
    // the same breach in miniature. The icon follows: Briefcase was a leftover
    // of the deleted career promise.
    textEn:
      "TAU's is the only PPE programme in Israel that combines the degree with law foundation studies. That is the law division: 14 of your 150 credits.",
    textHe:
      "פכ״מ של תל אביב הוא היחיד בישראל שמשלב לימודי יסוד במשפטים בתוך התואר. זו חטיבת המשפט, 14 ש״ס מתוך ה-150 שלכם.",
    category: "motivation",
    icon: Scale,
  },
  {
    id: "m-2",
    textEn: "Every semester that passes = 25 more credits behind you. Look back and see how far you've come.",
    textHe: "כל סמסטר שעובר = עוד 25 ש״ס מאחורי הגב. תסתכלו אחורה ותראו כמה התקדמתם.",
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
    // #20. Both figures failed against the live catalog. The basket holds NINE
    // active LAW_FOUNDATION courses, not ten — and the 14 was never a basket
    // figure at all: the division is חקיקה ורגולציה (4, fixed) + משפט וכלכלה
    // (2, fixed) + 8 ש״ס chosen from the basket. Only 8 of the 14 are a choice.
    //
    // A tip that names a basket size is a tip that goes stale the next time the
    // catalog moves, so it no longer names one — it states the STRUCTURE, which
    // is what a student needs and what the ידיעון actually fixes.
    textEn: "The law division: 14 credits — Legislation & Regulation and Law & Economics are fixed, plus 8 credits you choose from the foundation basket.",
    textHe: "חטיבת המשפט: 14 ש״ס — חקיקה ורגולציה ומשפט וכלכלה קבועים, ועוד 8 ש״ס מקורסי הבסיס לבחירתכם.",
    category: "academic_rule",
    icon: Scale,
  },
  {
    id: "ar-3",
    textEn: "2 courses in English required (min 2 credits each). Any discipline counts.",
    textHe: "חובה 2 קורסים באנגלית (2 ש״ס כ״א לפחות). בכל תחום שתרצו.",
    category: "academic_rule",
    icon: Globe,
  },
  {
    id: "ar-4",
    textEn: "Reserve soldiers: up to 10 credit exemptions across the degree (2-8 per year depending on group).",
    textHe: "משרתי מילואים: עד 10 ש״ס פטור לאורך כל התואר (2-8 בשנה לפי הקבוצה).",
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
    textHe: "מעבר שנה: ממוצע 75 כללי + 80 בפכ״מ. מתחת לזה = התראה אקדמית.",
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
    textHe: "סטודנטי פכ״מ פטורים מדרישת הקדם ׳קריאה מודרכת של דקארט׳ למבוא לפילוסופיה חדשה.",
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

