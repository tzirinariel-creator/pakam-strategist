// =========================================
// Demo-account guard helpers
// =========================================
// The demo account (NEXT_PUBLIC_DEMO_USER_EMAIL) is a SHARED, public showcase
// login used by many visitors at once. It must stay strictly READ-ONLY on the
// server so no visitor can read/overwrite/delete another's data, re-seed the
// showcase, or stash a personal Claude API key on the shared row.
//
// The single source of truth for "is this the demo user?" lives here and is
// matched by EMAIL against the env constant — never a hardcoded id — so it
// tracks whichever account the deployment designates as the demo.

/** Friendly, client-displayable message for blocked demo mutations (Hebrew-first UI). */
export const DEMO_READONLY_MESSAGE =
  "זהו חשבון הדגמה — הירשמו כדי לשמור תוכנית משלכם";

/**
 * Returns true when `email` is the configured demo account.
 *
 * Case-insensitive and whitespace-tolerant so a trailing space or differing
 * case in the env value or stored row can't accidentally let the shared
 * account slip past the read-only guard. Returns false when the demo email is
 * not configured (no env var) or when `email` is missing.
 */
export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  if (!demoEmail) return false;
  return email.trim().toLowerCase() === demoEmail.trim().toLowerCase();
}
