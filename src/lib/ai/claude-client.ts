// =========================================
// Claude Client Factory
// =========================================
// Server-side only — never import in client code.
// Creates a configured Anthropic instance from
// an encrypted API key, with key validation.

import Anthropic from "@anthropic-ai/sdk";
import { decrypt } from "@/lib/crypto";

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

/** The Claude model used across the app. */
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

/** Maximum tokens for a single response. */
export const MAX_TOKENS = 4096;

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// -------------------------------------------------------------------
// Key validation
// -------------------------------------------------------------------

/**
 * Validate that an API key has the expected Anthropic format.
 * Anthropic keys start with "sk-ant-" followed by alphanumeric
 * characters, hyphens, and underscores.
 */
export function validateApiKey(key: string): boolean {
  return /^sk-ant-[a-zA-Z0-9_-]{20,}$/.test(key.trim());
}

// -------------------------------------------------------------------
// Client factory
// -------------------------------------------------------------------

/**
 * Create an Anthropic client from an encrypted API key.
 *
 * 1. Decrypts the stored key using AES-256-GCM.
 * 2. Validates the decrypted key format.
 * 3. Returns a configured Anthropic instance.
 *
 * @throws Error if decryption fails or key format is invalid.
 */
export function createClaudeClient(encryptedKey: string): Anthropic {
  const apiKey = decrypt(encryptedKey);

  if (!validateApiKey(apiKey)) {
    throw new Error(
      "Decrypted API key has an invalid format. Expected key starting with 'sk-ant-'."
    );
  }

  return new Anthropic({ apiKey });
}

/**
 * Mask an API key for safe display.
 * Example: "sk-ant-api03-abc...wxyz" -> "sk-ant-••••wxyz"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return "sk-ant-" + "\u2022".repeat(8);
  }
  return "sk-ant-" + "\u2022".repeat(4) + key.slice(-4);
}
