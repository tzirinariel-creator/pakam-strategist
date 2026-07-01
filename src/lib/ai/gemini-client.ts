// =========================================
// Gemini Client — free-tier streaming via REST
// =========================================
// Server-side only — never import in client code.
// Talks to Google's Generative Language REST API directly (no SDK dependency),
// so a student can use Gemini's FREE tier with their own key. Mirrors the
// Claude path's (system, messages) contract so the chat route treats both the
// same way.

import { decrypt } from "@/lib/crypto";
import type { ChatMessage } from "@/lib/ai/claude-client";

/**
 * Free-tier model. MUST stay on Google's free tier (iron rule: Gemini is always
 * free for our students). `gemini-2.5-flash-lite` is free for input+output and
 * carries the highest free daily request quota of the Flash family (~1,000/day),
 * so a student is very unlikely to hit a limit.
 *
 * History: we were on `gemini-2.0-flash`, which Google DEPRECATED (Feb 2026) and
 * RETIRED on 3 Mar 2026 — after that date every request 404'd, which is what
 * surfaced as "hit the usage limit on first use" (#34). If Google deprecates
 * this model too, bump it to the current free Flash-Lite ID (one line).
 */
export const GEMINI_MODEL = "gemini-2.5-flash-lite";

const GEMINI_MAX_TOKENS = 4096;

/** Google AI Studio keys: legacy "AIza…" or the newer "AQ.…" auth keys. */
export function validateGeminiKey(key: string): boolean {
  return /^(AIza[0-9A-Za-z_-]{30,}|AQ\.[A-Za-z0-9._-]{20,})$/.test(key.trim());
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Stream a Gemini response as plain text chunks.
 *
 * @throws { status, message } on a non-OK response so the route can map codes
 *         to the same user-facing errors as the Claude path.
 */
export async function* streamGemini(
  encryptedKey: string,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = decrypt(encryptedKey);
  if (!validateGeminiKey(apiKey)) {
    throw { status: 400, message: "Invalid Gemini key format" };
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}` +
    `:streamGenerateContent?alt=sse`;

  // Gemini uses role "model" for the assistant; "user" stays "user".
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: "POST",
    // The key goes in the x-goog-api-key header (Google's documented method,
    // works for both legacy AIza keys and the new AQ. auth keys) rather than a
    // ?key= query param — also keeps the secret out of URLs/logs.
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: GEMINI_MAX_TOKENS },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore — we only need the status to map the error
    }
    throw { status: res.status || 500, message: detail || "Gemini request failed" };
  }

  // The response is a Server-Sent-Events stream of partial JSON candidates.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (possibly partial) line in the buffer.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const obj = JSON.parse(json) as GeminiStreamChunk;
        const parts = obj.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          const text = parts.map((p) => p.text ?? "").join("");
          if (text) yield text;
        }
      } catch {
        // ignore keep-alive / partial lines that aren't valid JSON yet
      }
    }
  }
}
