// =========================================
// Auth helpers — error mapping
// =========================================
// Shared by signup-form.tsx and login-form.tsx so that raw English Supabase
// error strings never reach the user; they are mapped to actionable
// Hebrew/English i18n keys under the `auth` namespace.

// ─── Supabase error → i18n key mapping ────────────────────────────

/**
 * Maps a known Supabase English error message to an i18n key under the
 * `auth` namespace. Returns `null` when the message isn't recognized, so
 * callers can fall back to a generic key rather than surfacing raw English.
 */
export function authErrorKey(message: string | undefined | null): string | null {
  if (!message) return null;
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) return "errInvalidCredentials";
  if (m.includes("email not confirmed")) return "errEmailNotConfirmed";
  if (m.includes("user already registered")) return "errUserAlreadyRegistered";
  // Supabase phrasing varies: "Password should be at least 6 characters"
  if (m.includes("password should be at least")) return "errWeakPassword";
  if (m.includes("email rate limit exceeded") || m.includes("rate limit"))
    return "errRateLimit";

  return null;
}
