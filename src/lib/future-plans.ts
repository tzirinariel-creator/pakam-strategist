// =========================================================================
// "מה אחרי התואר" — what WE know about you, not what the programme wants
// =========================================================================
// Ariel, 21.8: "אם מישהו רוצה לעשות תואר שני למשל ואז יש לזה דרישות מסוימות
// שקשורות לכלכלה או לציונים… או אם מישהו רוצה ללמוד בחו״ל. או לעבוד במשרד
// האוצר ואז כדאי לו לבחור בתחום מיקוד כלכלה. איך אתה מציע שנבצע את זה?"
//
// THE CONSTRAINT THAT SHAPES ALL OF IT: this app does not know what any of
// those programmes actually require. Not TAU's economics MA, not a foreign
// university, not the Ministry of Finance. Those requirements change yearly,
// they are not written down anywhere in this repo, and the project's hardest
// rule is that we never state a rule we cannot source. A screen that told a
// student "you need 85 for an economics MA" would be inventing the single
// number they would then plan two years around.
//
// So this deliberately inverts the usual shape of such a feature. It does not
// check the student against a programme's bar. It reports what the app
// genuinely holds — their average, their focus area, their English standing,
// their seminars, their credits — organised around the direction they picked,
// and it says plainly that the bar itself has to come from the programme.
//
// That is still worth building, because the useful part was never the bar. A
// student choosing electives in year one wants to know which of today's
// choices are the ones that matter later, and the app CAN answer that from its
// own data without pretending to be an admissions office.

export type DirectionId =
  | "econ-masters"
  | "law"
  | "public-policy"
  | "abroad"
  | "public-sector"
  | "undecided";

/** What the app can genuinely check about a student, per direction. */
export type SignalId =
  | "average"        // the degree average, which nearly every next step reads
  | "focusArea"      // which discipline they are concentrating in
  | "english"        // level — the one that gates studying abroad
  | "seminars"       // research writing, which research degrees look for
  | "quantitative";  // the economics/statistics spine

/**
 * A concrete, SOURCED gate for a direction.
 *
 * The rule below is the only one in this file, and it exists because it has a
 * source: the PPE secretary's email of 21.8.2026, quoted verbatim in the
 * comment on ECONOMETRICS_GATE. Everything else here reports the student's own
 * numbers precisely because we hold no other programme requirements. A second
 * entry may only be added with a citation of the same standing.
 */
export interface DirectionGate {
  courseCode: string;
  courseNameHe: string;
  he: string;
  en: string;
  /** Where the rule comes from — shown to the student, never omitted. */
  sourceHe: string;
  sourceEn: string;
}

/**
 * From the PPE secretary, 21.8.2026:
 *
 *   "ביה״ס לכלכלה ידרוש כדרישת קדם לקורסים מתקדמים בכלכלה ולסמינרים בביה״ס
 *    לכלכלה את השלמת הקורס 10112116 אקונומטריקה יישומית בסמסטר ב׳ של שנה ב׳
 *    או בשנה ג׳. […] הקורס אינו חובה למי שלא מתעתד.ת לקחת קורסים מתקדמים
 *    בביה״ס ו/או להמשיך לתואר שני בכלכלה."
 *
 * Which is why the course stays an ELECTIVE in the catalog — making it
 * mandatory for everyone would be wrong for most of the cohort — and why the
 * app raises it only for the two directions it actually gates.
 */
export const ECONOMETRICS_GATE: DirectionGate = {
  courseCode: "1011-2116",
  courseNameHe: "אקונומטריקה יישומית",
  he: "ביה״ס לכלכלה דורש את אקונומטריקה יישומית (1011-2116) כדרישת קדם לקורסים מתקדמים בכלכלה ולסמינרים שלו — בסמסטר ב׳ של שנה ב׳ או בשנה ג׳. מי שלא ממשיך לשם לא חייב אותה.",
  en: "The school of economics requires Applied Econometrics (1011-2116) as a prerequisite for its advanced courses and seminars — in year 2 semester B, or in year 3. It is not required for anyone not continuing there.",
  sourceHe: "מהודעת מזכירות פכ״מ, אוגוסט 2026",
  sourceEn: "From the PPE secretariat, August 2026",
};

export interface Direction {
  id: DirectionId;
  he: string;
  en: string;
  /** One honest line about why these signals, not what the programme demands. */
  whyHe: string;
  whyEn: string;
  /** Which of the app's own facts are worth surfacing for this direction. */
  signals: SignalId[];
  /** A focus area that plainly fits. Null when the direction does not imply one. */
  suggestsFocus: "ECONOMICS" | "PHILOSOPHY" | "POLITICAL_SCIENCE" | null;
  /** A sourced course requirement this direction actually gates on. */
  gate?: DirectionGate;
}

export const DIRECTIONS: Direction[] = [
  {
    id: "econ-masters",
    he: "תואר שני בכלכלה",
    en: "Economics master's",
    whyHe: "תוכניות מחקר בכלכלה מסתכלות בדרך כלל על הממוצע ועל הרקע הכמותי — אלה שני הדברים שאנחנו יכולים להראות לכם מהנתונים שלכם.",
    whyEn: "Research programmes in economics typically look at the average and the quantitative background — the two things we can show you from your own data.",
    signals: ["average", "quantitative", "focusArea", "seminars"],
    suggestsFocus: "ECONOMICS",
    gate: ECONOMETRICS_GATE,
  },
  {
    id: "law",
    he: "משפטים",
    en: "Law",
    whyHe: "מעבר למשפטים נשען על הממוצע ועל כתיבה — הסמינריונים הם ההוכחה שיש לכם לזה.",
    whyEn: "Moving to law leans on the average and on writing — your seminar papers are the evidence you have for that.",
    signals: ["average", "seminars"],
    suggestsFocus: null,
  },
  {
    id: "public-policy",
    he: "מדיניות ציבורית",
    en: "Public policy",
    whyHe: "שילוב של מדע המדינה וכלכלה הוא הרקע הטבעי, ורוב התוכניות מבקשות גם עבודה סמינריונית.",
    whyEn: "A mix of political science and economics is the natural background, and most programmes ask for a seminar paper too.",
    signals: ["average", "focusArea", "seminars"],
    suggestsFocus: "POLITICAL_SCIENCE",
  },
  {
    id: "abroad",
    he: "לימודים בחו״ל",
    en: "Studying abroad",
    // 5.9, אריאל, על המשפט הקודם: *"סתכל איזה פאדיחה של עברית"*. הוא צדק —
    // "ואותו אנחנו כן יודעים לעקוב אחריו" נושא מושא כפול (אותו + אחריו),
    // וקרא כמו תרגום מכונה באמצע מסך בעברית.
    whyHe: "אנגלית היא מה שהכי קל לדחות בלי לשים לב, ובחו״ל היא תנאי סף — ואת רמת האנגלית שלכם אנחנו כן יודעים לעקוב מהנתונים.",
    whyEn: "English is the easiest thing to put off without noticing, and abroad it is a hard requirement — and your English level is something we can actually track from your data.",
    signals: ["english", "average", "seminars"],
    suggestsFocus: null,
  },
  {
    id: "public-sector",
    he: "מגזר ציבורי / משרדי ממשלה",
    en: "Public sector",
    whyHe: "סיווג התפקיד בשירות המדינה נגזר מתחום המיקוד — זה השדה שהכי כדאי לשים לב אליו מוקדם.",
    whyEn: "A civil-service role classification derives from the focus area — the field most worth noticing early.",
    signals: ["focusArea", "average", "quantitative"],
    suggestsFocus: "ECONOMICS",
  },
  {
    id: "undecided",
    he: "עוד לא החלטתי",
    en: "Not decided yet",
    whyHe: "זו תשובה לגיטימית. בינתיים נראה לכם את התמונה הכללית — מה שפתוח בפני רוב הכיוונים.",
    whyEn: "A legitimate answer. In the meantime here is the general picture — what most directions have in common.",
    signals: ["average", "focusArea", "english", "seminars"],
    suggestsFocus: null,
  },
];

export function directionById(id: string | null | undefined): Direction | null {
  return DIRECTIONS.find((d) => d.id === id) ?? null;
}

export interface StudentFacts {
  /** Credit-weighted course average, or null before any grade exists. */
  average: number | null;
  focusArea: string | null;
  /** Level courses still owed; 0 when the track is done. Null when unknown. */
  englishRemaining: number | null;
  englishExempt: boolean;
  seminarsCompleted: number;
  /** Completed credits in the quantitative spine (economics + statistics). */
  quantitativeCredits: number;
  creditsCompleted: number;
}

export interface Signal {
  id: SignalId;
  /** The student's own number/state, as a short string. */
  valueHe: string;
  valueEn: string;
  /**
   * Whether this looks settled, in progress, or not started — for the chip.
   * Deliberately NOT "good/bad": we have no bar to judge against, and a red
   * mark next to a 78 average would be this app inventing a verdict.
   */
  state: "done" | "in-progress" | "none";
}

/**
 * Turn the app's facts into the signals for one direction.
 *
 * Every value here is something the student could read elsewhere in the app.
 * Nothing is compared to a threshold, because we hold no thresholds worth
 * comparing to.
 */
export function signalsFor(direction: Direction, facts: StudentFacts): Signal[] {
  const out: Signal[] = [];

  for (const id of direction.signals) {
    if (id === "average") {
      out.push({
        id,
        valueHe: facts.average == null ? "עוד אין ציונים" : `${facts.average}`,
        valueEn: facts.average == null ? "No grades yet" : `${facts.average}`,
        state: facts.average == null ? "none" : "in-progress",
      });
    }
    if (id === "focusArea") {
      const matches =
        direction.suggestsFocus != null && facts.focusArea === direction.suggestsFocus;
      out.push({
        id,
        valueHe: facts.focusArea == null ? "עוד לא נבחר" : matches ? "מתאים לכיוון" : "נבחר",
        valueEn: facts.focusArea == null ? "Not chosen yet" : matches ? "Fits this direction" : "Chosen",
        state: facts.focusArea == null ? "none" : "done",
      });
    }
    if (id === "english") {
      out.push({
        id,
        valueHe: facts.englishExempt
          ? "פטור"
          : facts.englishRemaining == null
            ? "לא ידוע"
            : facts.englishRemaining === 0
              ? "קורסי הרמה הושלמו"
              : `נשארו ${facts.englishRemaining}`,
        valueEn: facts.englishExempt
          ? "Exempt"
          : facts.englishRemaining == null
            ? "Unknown"
            : facts.englishRemaining === 0
              ? "Level courses done"
              : `${facts.englishRemaining} left`,
        state:
          facts.englishExempt || facts.englishRemaining === 0
            ? "done"
            : facts.englishRemaining == null
              ? "none"
              : "in-progress",
      });
    }
    if (id === "seminars") {
      out.push({
        id,
        valueHe: facts.seminarsCompleted === 0 ? "עוד לא" : `${facts.seminarsCompleted}`,
        valueEn: facts.seminarsCompleted === 0 ? "None yet" : `${facts.seminarsCompleted}`,
        state: facts.seminarsCompleted > 0 ? "done" : "none",
      });
    }
    if (id === "quantitative") {
      out.push({
        id,
        valueHe: facts.quantitativeCredits === 0 ? "עוד לא" : `${facts.quantitativeCredits} ש״ס`,
        valueEn: facts.quantitativeCredits === 0 ? "None yet" : `${facts.quantitativeCredits} cr.`,
        state: facts.quantitativeCredits > 0 ? "in-progress" : "none",
      });
    }
  }

  return out;
}

export const SIGNAL_LABELS: Record<SignalId, { he: string; en: string }> = {
  average: { he: "הממוצע שלכם", en: "Your average" },
  focusArea: { he: "תחום המיקוד", en: "Focus area" },
  english: { he: "אנגלית", en: "English" },
  seminars: { he: "סמינריונים שהושלמו", en: "Seminars completed" },
  quantitative: { he: "רקע כמותי", en: "Quantitative background" },
};
