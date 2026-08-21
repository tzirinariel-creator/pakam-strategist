// =========================================================================
// Courses PPE teaches in English — named in English, findable in Hebrew
// =========================================================================
// Ariel, 21.8: "קורסים שנלמדים באנגלית - בוא נקרא להם באנגלית לא?"
//
// He is right, and the previous state broke a house rule. These ten courses
// are taught in English and the ידיעון names them in English. Our catalog was
// showing a Hebrew title instead — a title that appears in no official source,
// because we wrote it. A student who looked the course up for registration saw
// one name in Pakamon and a different one at the university.
//
// So the course's name is now the English one, everywhere.
//
// The Hebrew we had is not thrown away, it is demoted to what it always
// actually was: a search aid. A student who thinks "כלכלה בינלאומית" still
// finds International Economics — the catalog search consults this map — but
// nothing on screen presents our translation as the course's name.

export interface EnglishTaughtCourse {
  code: string;
  /** The official name, as the ידיעון prints it. */
  nameEn: string;
  /** Our own Hebrew gloss. Search only — never displayed as the name. */
  hebrewAlias: string;
}

export const ENGLISH_TAUGHT_COURSES: EnglishTaughtCourse[] = [
  { code: "1662-1108", nameEn: "A Political History of the Economy", hebrewAlias: "היסטוריה פוליטית של הכלכלה" },
  { code: "1662-1300", nameEn: "Introduction to Modern Jewish Thought", hebrewAlias: "מבוא למחשבה יהודית מודרנית" },
  { code: "1662-1400", nameEn: "Introduction to Greek Philosophy", hebrewAlias: "מבוא לפילוסופיה יוונית" },
  { code: "1031-0917", nameEn: "Middle East Politics", hebrewAlias: "פוליטיקה של המזרח התיכון" },
  { code: "0651-1014", nameEn: "Democratic Theory and Social Choice", hebrewAlias: "תיאוריה דמוקרטית ובחירה חברתית" },
  { code: "1411-6604", nameEn: "Derivatives, Risk and Financial Crises", hebrewAlias: "נגזרים, סיכון ומשברים פיננסיים" },
  { code: "1011-3310", nameEn: "International Economics", hebrewAlias: "כלכלה בינלאומית" },
  { code: "1011-3359", nameEn: "Industrial Organization", hebrewAlias: "ארגון תעשייתי" },
  { code: "1011-3450", nameEn: "Development Economics", hebrewAlias: "כלכלת פיתוח" },
  { code: "1011-3509", nameEn: "Options and Financial Markets", hebrewAlias: "אופציות ושווקים פיננסיים" },
];

/**
 * Course codes whose Hebrew alias matches a search term.
 *
 * Returns [] for a blank or very short term so a stray keystroke cannot pull
 * all ten in. The caller ORs these codes into its existing name/code search.
 */
export function codesMatchingHebrewAlias(search: string): string[] {
  const q = search.trim().toLowerCase();
  if (q.length < 2) return [];
  return ENGLISH_TAUGHT_COURSES
    .filter((c) => c.hebrewAlias.toLowerCase().includes(q))
    .map((c) => c.code);
}

/** True when this course is one we deliberately name in English. */
export function isEnglishTaught(code: string): boolean {
  return ENGLISH_TAUGHT_COURSES.some((c) => c.code === code);
}
