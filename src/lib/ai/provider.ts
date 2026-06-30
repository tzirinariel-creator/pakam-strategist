// =========================================
// AI Provider detection (BYOK)
// =========================================
// Provider-agnostic helpers so a student can bring EITHER a free Google Gemini
// key (starts "AIza…") or a paid Anthropic Claude key (starts "sk-ant-…").
// The provider is inferred from the key prefix, so the SAME encrypted column
// (`encryptedClaudeKey`) stores both and no schema change / migration is needed.

export type AiProvider = "gemini" | "anthropic";

const ANTHROPIC_RE = /^sk-ant-[a-zA-Z0-9_-]{20,}$/;
// Google issues two key formats: the legacy "AIza…" keys and the newer "AQ.…"
// auth keys (every NEW Google AI Studio key is "AQ." as of mid-2026, and the
// old "AIza" keys are being phased out). Both are valid free-tier Gemini keys.
const GEMINI_RE = /^(AIza[0-9A-Za-z_-]{30,}|AQ\.[A-Za-z0-9._-]{20,})$/;

/** Identify which provider a raw key belongs to, or null if it's neither. */
export function detectProvider(key: string): AiProvider | null {
  const k = key.trim();
  if (GEMINI_RE.test(k)) return "gemini";
  if (ANTHROPIC_RE.test(k)) return "anthropic";
  return null;
}

/** True if the key is a valid format for any supported provider. */
export function validateAnyApiKey(key: string): boolean {
  return detectProvider(key) !== null;
}

/**
 * Mask a key for safe display, keeping the provider prefix + last 4 chars.
 * e.g. "AIzaSy...wxyz" -> "AIza••••wxyz".
 */
export function maskAnyApiKey(key: string): string {
  const k = key.trim();
  // Keep whichever real prefix the key has, so the mask is recognizable.
  const prefix = k.startsWith("AQ.")
    ? "AQ."
    : k.startsWith("AIza")
      ? "AIza"
      : k.startsWith("sk-ant-")
        ? "sk-ant-"
        : "";
  const tail = k.length >= 4 ? k.slice(-4) : "";
  return `${prefix}${"•".repeat(4)}${tail}`;
}

/** Human-readable provider name. */
export function providerLabel(provider: AiProvider): string {
  return provider === "gemini" ? "Google Gemini" : "Anthropic Claude";
}
