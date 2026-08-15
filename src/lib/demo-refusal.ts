// =========================================================================
// Was this failure our own demo guard, or a real one?
// =========================================================================
// The demo account is read-only by design, so every write it attempts is
// refused by the server. The onboarding screen used to render ALL failures as
// "כנראה בעיית חיבור. רעננו ונסו שוב" — which for the demo is simply untrue:
// nothing is wrong with the network, and no amount of refreshing will help.
// Ariel walked the demo, hit the wall, and reported it as "משהו מוזר".
//
// Telling someone to fix their internet when the answer is "sign up to save"
// is worse than saying nothing: it sends them to solve a problem they don't
// have, and it hides the one call to action that would actually work.
import { DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";

/**
 * True when `error` is the read-only demo guard rather than a real failure.
 * Matches on the guard's own message, which the tRPC error carries through —
 * no error CODE is reliable here, because the guard throws FORBIDDEN and so do
 * other legitimate rejections.
 */
export function isDemoRefusal(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";
  if (!message) return false;
  // The message travels verbatim, but a wrapper may prefix or wrap it — so
  // substring, not equality. A distinctive fragment keeps that safe.
  return message.includes(DEMO_READONLY_MESSAGE) || message.includes("חשבון הדגמה");
}
