// =========================================================================
// Undoing the ידיעון's typesetting, so its names can be trusted as names
// =========================================================================
// The ידיעון's assessment table pads punctuation on both sides and lets a
// neighbouring column bleed into the title cell. Neither is a different course
// name, but both look like one when you diff two lists — unnormalised, roughly
// sixty cosmetic differences bury the handful that are real.
//
// This lives in lib rather than beside the scripts that use it for a reason
// CI taught us: the scripts open a database connection at module scope, so a
// test importing a pure helper out of one of them failed in CI with
// "DATABASE_URL not set" while passing locally, where .env.local exists. Pure
// logic belongs where it can be imported without side effects.

/**
 * Strip the ידיעון's presentation from a course name without touching a word.
 *
 * `סטטיסטיקה לפכ" מ` → `סטטיסטיקה לפכ"מ`
 * `מיומנויות יסוד : קריאה` → `מיומנויות יסוד: קריאה`
 * `הלכה כפילוסופיה יהודית שנתי` → `הלכה כפילוסופיה יהודית`
 */
export function tidyYedionName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/([״"׳'])\s+(?=\S)/g, "$1")   // gershayim glued back to the next letter
    .replace(/\s+([:,.?!])/g, "$1")         // no space BEFORE punctuation
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
    // "שנתי" is a yearly-course marker that bleeds in from the neighbouring
    // column, not part of the title — all four courses carrying it also have
    // an ordinary semester value of "א". Caught after it had already been
    // written into the catalog once, as "הלכה כפילוסופיה יהודית שנתי".
    .replace(/\s+שנתי\s*$/, "")
    // A spaced hyphen is ambiguous here, because the ידיעון pads BOTH the
    // compound hyphen of "הניאו-ליברלי" and the clause dash of "ועירוניות -
    // סמינר מעשי". Gluing indiscriminately produced "לחשוב מקום-לחשוב שפה",
    // which is not the course's name. So glue only after a real Hebrew
    // compounding prefix, or before a number as in "ה-19"; everything else
    // stays a spaced dash, which is what the rest of our catalog uses.
    //
    // The stem may itself carry a Hebrew prefix letter — the case that caught
    // this was "בעידן הניאו - ליברלי", where the token is "הניאו", not
    // "ניאו", so a bare stem list silently matched nothing.
    .replace(
      /(^|\s)([הובלכמש]?(?:ניאו|אנטי|פרו|בין|תת|רב|אי|דו|חד|תלת|קדם|בתר|על|פוסט|פרה|מטא))\s+-\s+/g,
      "$1$2-",
    )
    .replace(/\s+-\s+(?=\d)/g, "-")
    .trim();
}

/**
 * True when a ידיעון cell was clipped mid-title.
 *
 * That table truncates long names — the entire cell for 0621-1974 is
 * `וצדק לכל ? ארה"`. A clipped name must never overwrite anything, because it
 * is worse than an obviously-broken placeholder: it looks correct.
 */
export function looksTruncated(name: string): boolean {
  const n = name.trim();
  if (n.length < 8) return true;
  if (/[״"׳'\-–,:]$/.test(n)) return true;          // ends on punctuation that opens something
  if (/\s[הובלמש]$/.test(n)) return true;           // ends on a dangling prefix letter
  return false;
}
