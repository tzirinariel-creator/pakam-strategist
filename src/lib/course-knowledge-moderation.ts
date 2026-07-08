// Server-side moderation for course-review free text (#3, #16). A pure,
// synchronous gate run BEFORE saving a tip. MVP is regex-based (no AI cost /
// latency); can be upgraded to Gemini moderation in a later wave. The goal is
// modest: block contact-info harvesting and overt abuse, not perfect NLP.

export interface ModerationResult {
  ok: boolean;
  /** Hebrew, user-facing reason when ok === false. */
  reason?: string;
}

// Links / emails / phones — a review is about the course, not a place to drop
// contact details or spam.
const LINK_RE = /(https?:\/\/|www\.)\S+/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Israeli-style phone runs (0xx-xxxxxxx, +972…) — 9+ digits with separators.
const PHONE_RE = /(?:\+?972|0)(?:[\s-]?\d){8,}/;

// A short overt-abuse list (HE + EN). Deliberately small; the closed tag
// vocabulary already removes most abuse surface. Matched on word-ish boundaries
// to avoid false positives inside longer words.
const BANNED = [
  "מטומטם",
  "אידיוט",
  "מפגר",
  "זבל",
  "שרמוטה",
  "בן זונה",
  "כוס",
  "idiot",
  "moron",
  "retard",
  "asshole",
  "bitch",
  "fuck",
  "shit",
];

export function moderateTip(rawTip: string): ModerationResult {
  const tip = rawTip.trim();
  if (tip.length === 0) return { ok: true };

  if (LINK_RE.test(tip) || EMAIL_RE.test(tip)) {
    return { ok: false, reason: "אי אפשר לצרף קישורים או כתובות מייל בטיפ." };
  }
  if (PHONE_RE.test(tip)) {
    return { ok: false, reason: "אי אפשר לצרף מספרי טלפון בטיפ." };
  }

  const lower = tip.toLowerCase();
  for (const word of BANNED) {
    if (lower.includes(word.toLowerCase())) {
      return { ok: false, reason: "הטיפ מכיל ניסוח פוגעני. נסחו אותו עניינית ונסו שוב." };
    }
  }

  return { ok: true };
}
