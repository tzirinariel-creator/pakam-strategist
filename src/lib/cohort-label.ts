// Design research (24.7 social-features deep dive): make the cross-cohort
// knowledge FLOW visible instead of a bare year number — the data (cohortYear)
// was already collected and shown, this is pure framing with zero new privacy
// surface (no roster, no identity — same anonymous content, just says how
// many years ahead the contributor was). Only frames "ahead of you" for an
// OLDER cohort; a same- or younger-year tag falls back to the plain "מחזור X"
// it already was.
export function cohortLabel(
  cohortYear: number | null,
  myStartYear: number | null | undefined,
  isHe: boolean,
): string {
  if (!cohortYear) return isHe ? "מחזור קודם" : "Alum";
  if (myStartYear != null && cohortYear < myStartYear) {
    const gap = myStartYear - cohortYear;
    return isHe
      ? `מחזור ${cohortYear} — ${gap === 1 ? "שנה אחת לפניך" : `${gap} שנים לפניך`}`
      : `Class of ${cohortYear} — ${gap} ${gap === 1 ? "year" : "years"} ahead of you`;
  }
  return isHe ? `מחזור ${cohortYear}` : `Class of ${cohortYear}`;
}
