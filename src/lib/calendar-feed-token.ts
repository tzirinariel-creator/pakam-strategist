// =========================================================================
// Personal calendar-feed token (retention hook #1) — stateless, no migration.
// =========================================================================
// The feed URL embeds the userId + an HMAC of it keyed by ENCRYPTION_KEY, so
// the endpoint can authenticate a subscription with ZERO stored state and no
// schema change. The token is unguessable (HMAC-SHA256) and scoped to one
// user; it grants read-only access to that user's own dated milestones only.
// Rotating ENCRYPTION_KEY invalidates every feed (acceptable — it's a secret).

import { createHmac } from "node:crypto";

function secret(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY missing — cannot sign calendar feed");
  return k;
}

/** Deterministic per-user signature (hex, 32 chars). */
export function calendarFeedSig(userId: string): string {
  return createHmac("sha256", secret()).update(`calfeed:${userId}`).digest("hex").slice(0, 32);
}

/** The path segment: `<userId>.<sig>` — carries the id so lookup needs no DB scan. */
export function calendarFeedToken(userId: string): string {
  return `${userId}.${calendarFeedSig(userId)}`;
}

/** Parse + verify a token; returns the userId or null. Constant-ish compare. */
export function verifyCalendarFeedToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = calendarFeedSig(userId);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? userId : null;
}
