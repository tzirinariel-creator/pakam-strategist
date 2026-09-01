// =========================================================================
// "אם יש לי 90 באנגלית — הוא מסמן לי משהו אוטומטי או לא?"
// =========================================================================
// Ariel, and by his own count the hundredth time:
//
//   "ציון אמירנט וכו — שואל בפעם ה-100. אם יש לי 90 באנגלית שזה באמת המציאות,
//    הוא מסמן לי פה משהו אוטומטי או לא? כי זה מאוד יוצר אמון."
//
// The answer was: in three places yes, and in the one place he was looking,
// no. Typing a score into SETTINGS — the screen the app's own regulation card
// sends him to — produced nothing at all. No level, no course count, no
// colour, no acknowledgement. The only text was a static hint promising that
// the field "קובע אילו קורסי אנגלית נדרשים מכם", a promise the screen then
// did not keep.
//
// The onboarding step had a good live label all along. It was written inline
// there, so no other screen could use it. This is that label, extracted, with
// three corrections:
//
// 1. IT ROUTES THROUGH `resolveEnglishLevel`. A declared level outranks a
//    score — that is an iron rule of this project — so a student who told us
//    "I am exempt" must not be told "basic" because an old score is on file.
//
// 2. IT CARRIES ITS SOURCE. The number of level courses is stated in the app
//    with complete confidence, and a student who checks with the secretariat
//    and hears a different number stops believing every other number we show.
//    The mapping is ours, dated, and says so on screen.
//
// 3. "טרום בסיסי" NO LONGER SAYS "דחייה אוטומטית". The field is labelled
//    "ציון אמירנט / פסיכומטרי אנגלית", and Ariel's own question — "יש לי 90
//    באנגלית" — is the proof that people read it as their grade in an English
//    COURSE. Someone typing 80 in that belief is a registered student being
//    told, in red, that they are auto-rejected. The likeliest explanation is
//    the wrong number in the box, and that is what it now says.

import {
  AMIRNET_CONFIG,
  resolveEnglishLevel,
  type EnglishLevel,
} from "@/lib/constants";

export interface PlacementLabel {
  level: EnglishLevel;
  /** The headline — level plus what it costs, in one line. */
  he: string;
  en: string;
  /** Where the mapping comes from. Never omitted. */
  sourceHe: string;
  sourceEn: string;
  /** How sure we are: a declared level is a fact, a score is our mapping. */
  from: "declared" | "score";
  tone: "good" | "neutral" | "caution" | "check";
  /** Set when the input itself looks wrong — see rule 3 above. */
  suspectInputHe?: string;
  suspectInputEn?: string;
}

const SOURCE_HE = "לפי מיפוי הרמות של יחידת האנגלית, נכון לתשפ״ו — שווה לאמת מול המזכירות";
const SOURCE_EN = "Per the English unit's level mapping, as of 2025/26 — worth confirming with the secretariat";

/** PPE owes two content courses in English whatever the level is (PKM-012). */
const CONTENT_COURSES = AMIRNET_CONFIG.PPE_CONTENT_COURSES_REQUIRED;

/**
 * What to show under the score field, right now.
 *
 * Returns null only when there is genuinely nothing to say — no declared level
 * and no score — because an empty label is better than a confident guess.
 */
export function englishPlacementLabel(
  declaredLevel: string | null | undefined,
  amiramScore: number | null | undefined,
): PlacementLabel | null {
  const info = resolveEnglishLevel(declaredLevel, amiramScore ?? null);
  if (!info) return null;

  const level = info.level;
  const from: "declared" | "score" = declaredLevel ? "declared" : "score";
  const courses = info.levelCourses;
  const nameHe = info.nameHe;
  const nameEn = info.nameEn;

  const heCourses =
    courses === 0
      ? "בלי קורסי רמה"
      : courses === 1
        ? "קורס רמה אחד"
        : `${courses} קורסי רמה`;
  const enCourses =
    courses === 0 ? "no level courses" : courses === 1 ? "1 level course" : `${courses} level courses`;

  const base: PlacementLabel = {
    level,
    he: `${nameHe} — ${heCourses}, ועוד ${CONTENT_COURSES} קורסי תוכן באנגלית`,
    en: `${nameEn} — ${enCourses}, plus ${CONTENT_COURSES} English content courses`,
    sourceHe: from === "declared" ? "לפי הרמה שהצהרתם עליה" : SOURCE_HE,
    sourceEn: from === "declared" ? "From the level you declared" : SOURCE_EN,
    from,
    tone: level === "EXEMPT" ? "good" : level === "PRE_BASIC" ? "check" : "neutral",
  };

  // The score is below TAU's admission minimum — which for a registered
  // student is far more likely to mean the wrong number was typed than that
  // they were admitted below the bar.
  if (level === "PRE_BASIC" && from === "score") {
    base.suspectInputHe =
      "הציון שהזנתם נמוך מרף הקבלה של האוניברסיטה. בדקו שזה באמת ציון אמירם/פסיכומטרי ולא ציון שקיבלתם בקורס אנגלית — אלה שני מספרים שונים.";
    base.suspectInputEn =
      "That score is below the university's admission minimum. Check it is an Amiram/psychometric score and not a grade from an English course — they are different numbers.";
  }

  return base;
}
