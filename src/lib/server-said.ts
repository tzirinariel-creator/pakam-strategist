// =========================================================================
// When the server already said the true thing, say it
// =========================================================================
// Found by pressing "שמרו פרופיל" on the demo account. The server answered,
// correctly and in Hebrew:
//
//     "זהו חשבון הדגמה — הירשמו כדי לשמור תוכנית משלכם"
//
// and the screen showed:
//
//     "לא הצלחנו לעדכן את הפרופיל — נסו שוב"
//
// Trying again will never work. The client had thrown away an accurate,
// actionable sentence and replaced it with advice the student cannot act on.
// Seventeen `onError` handlers did the same thing, so on a demo account every
// single save in the app failed with a shrug.
//
// The rule, and the reason it is one function and not seventeen judgements:
//
//   A server message is DELIBERATE when its tRPC code says a human wrote it —
//   FORBIDDEN (a guard), BAD_REQUEST (validation), TOO_MANY_REQUESTS (a quota),
//   CONFLICT, NOT_FOUND, PAYMENT_REQUIRED. Those messages exist to be read.
//
//   INTERNAL_SERVER_ERROR and friends are the app breaking. Whatever string
//   rides along is for the logs, not for a student, and the local fallback —
//   which knows what was being attempted and whether data is safe — is better.

/** The shape tRPC's client error exposes. Kept structural so this module has
 *  no dependency on the router types. */
interface MaybeTRPCError {
  message?: unknown;
  data?: { code?: unknown } | null;
  shape?: { data?: { code?: unknown } | null } | null;
}

/** Codes whose message a human wrote FOR the student. */
const DELIBERATE = new Set([
  "FORBIDDEN",
  "UNAUTHORIZED",
  "BAD_REQUEST",
  "TOO_MANY_REQUESTS",
  "CONFLICT",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "PAYMENT_REQUIRED",
  "UNPROCESSABLE_CONTENT",
]);

/** Anything that looks like a stack, a type name, or a bare identifier is not
 *  a sentence and must never reach a student, whatever the code says. */
function readsLikeASentence(m: string): boolean {
  if (m.length < 8 || m.length > 300) return false;
  if (/^[A-Z_]+$/.test(m)) return false;
  if (/\bat\s+\w+\s*\(|Error:|undefined|null|\bTypeError\b|\{|\}|<\w+>/.test(m)) return false;
  return true;
}

/**
 * The message to show the student.
 *
 * @param err       whatever the mutation's onError received
 * @param fallback  the local sentence — it knows what was attempted and
 *                  whether their data is safe, so it wins whenever the server
 *                  has nothing deliberate to say.
 */
export function serverSaid(err: unknown, fallback: string): string {
  const e = err as MaybeTRPCError | null | undefined;
  if (!e) return fallback;
  const code = (e.data?.code ?? e.shape?.data?.code) as string | undefined;
  const msg = typeof e.message === "string" ? e.message.trim() : "";
  if (!msg || !code || !DELIBERATE.has(code)) return fallback;
  return readsLikeASentence(msg) ? msg : fallback;
}
