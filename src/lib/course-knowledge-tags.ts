// Closed tag vocabulary for course reviews (#3, #16). A fixed list — no free
// "other" field — so there is no open abuse surface, filtering is trivial, and
// the tags stay honest (a reported fact, never a "take this, it's easy" nudge).

export const ALLOWED_TAGS = [
  "מרצה_מעולה",
  "בוחן_קשה",
  "עבודה_גדולה",
  "נוכחות_חובה",
  "ציון_נדיב",
  "הרבה_קריאה",
  "מומלץ_למיקוד",
  "טוב_לשנה_א",
  "עומס_בסוף",
] as const;

export type CourseTag = (typeof ALLOWED_TAGS)[number];

export const TAG_LABELS: Record<CourseTag, { he: string; en: string }> = {
  מרצה_מעולה: { he: "מרצה מעולה", en: "Great lecturer" },
  בוחן_קשה: { he: "בוחן קשה", en: "Tough exam" },
  עבודה_גדולה: { he: "עבודה גדולה", en: "Big project" },
  נוכחות_חובה: { he: "נוכחות חובה", en: "Attendance required" },
  ציון_נדיב: { he: "ציון נדיב", en: "Generous grading" },
  הרבה_קריאה: { he: "הרבה קריאה", en: "Heavy reading" },
  מומלץ_למיקוד: { he: "מומלץ לתחום המיקוד", en: "Good for your focus" },
  טוב_לשנה_א: { he: "טוב לשנה א׳", en: "Good for year 1" },
  עומס_בסוף: { he: "העומס בסוף", en: "Back-loaded" },
};

export function isAllowedTag(t: string): t is CourseTag {
  return (ALLOWED_TAGS as readonly string[]).includes(t);
}
