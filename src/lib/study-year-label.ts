// =========================================================================
// "שנה ב׳", never "שנה 2"
// =========================================================================
// Ariel, #8, 2.9: "ולמה כתוב שנה 2 ולא שנה ב׳?"
//
// He pointed at the bidding screen, but the digit was in eight places. Each one
// had reinvented the same three-line solution — YEAR_CONFIG lookups, an inline
// ["", "א׳", "ב׳", "ג׳"] array, a bare template literal — and the ones that
// forgot printed the digit. That is what a missing helper looks like from the
// outside: an inconsistency that reads as carelessness.
//
// A study year is 1–3 (4 with an extension). It is ALWAYS spoken as a Hebrew
// letter in this product. The academic YEAR (תשפ״ז) is a different thing and
// lives in academic-calendar.ts — do not confuse them.

import { YEAR_CONFIG } from "@/lib/constants";

/** "שנה ב׳" / "Year B". Falls back to the digit only for a year we have no
 *  name for, which is better than printing nothing. */
export function studyYearLabel(year: number | null | undefined, isHe: boolean): string {
  if (year == null) return "";
  const cfg = YEAR_CONFIG[year as keyof typeof YEAR_CONFIG];
  if (cfg) return isHe ? cfg.nameHe : cfg.nameEn;
  return isHe ? `שנה ${year}` : `Year ${year}`;
}

/** Just the letter — "ב׳" — for places that already say the word שנה. */
export function studyYearLetter(year: number | null | undefined, isHe: boolean): string {
  const full = studyYearLabel(year, isHe);
  return isHe ? full.replace(/^שנה\s*/, "") : full.replace(/^Year\s*/, "");
}

/** "א׳/ב׳" for a course offered in more than one year. */
export function studyYearList(years: number[], isHe: boolean): string {
  return years.map((y) => studyYearLetter(y, isHe)).join("/");
}
