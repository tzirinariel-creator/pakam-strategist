// =========================================
// Personal address — name + gendered Hebrew
// =========================================
// The app addresses the student by name and (when known) in the correct gender.
// When gender is unknown we fall back to the existing inclusive "/" phrasing, so
// nothing regresses for users who never set it.

export type Gender = "male" | "female" | null | undefined;

export interface PersonProfile {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  gender?: string | null;
}

/**
 * First name for a salutation: an explicit firstName, else the first token of
 * displayName. Returns null when we have nothing usable (caller shows a generic
 * greeting). Trims and guards against an email-looking displayName.
 */
export function firstNameOf(p?: PersonProfile | null): string | null {
  if (!p) return null;
  const fn = p.firstName?.trim();
  if (fn) return fn;
  const dn = p.displayName?.trim();
  if (dn && !dn.includes("@")) {
    const first = dn.split(/\s+/)[0];
    if (first) return first;
  }
  return null;
}

export function normalizeGender(g?: string | null): Gender {
  return g === "male" || g === "female" ? g : null;
}

/**
 * Pick a gendered form. Unknown gender → the neutral fallback `n` (which should
 * be today's inclusive "/" text), so callers are always safe to adopt this.
 *   g(gender, { m: "מוזמן", f: "מוזמנת", n: "מוזמן/ת" })
 */
export function gendered(
  gender: Gender,
  forms: { m: string; f: string; n: string }
): string {
  const norm = normalizeGender(gender);
  return norm === "male" ? forms.m : norm === "female" ? forms.f : forms.n;
}

/** A greeting head: "היי דני" / "היי" (no name) — never "היי null". */
export function greetingName(p?: PersonProfile | null): string | null {
  return firstNameOf(p);
}
