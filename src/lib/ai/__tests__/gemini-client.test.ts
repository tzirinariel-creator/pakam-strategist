import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

// Truncation detection in streamGemini (#36): Gemini reports MAX_TOKENS in the
// LAST SSE chunk's finishReason — including one that arrives without a trailing
// newline (the flush path). The route turns state.truncated into an honest
// "נעצרתי לפני הסוף" line instead of ending mid-word.

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const chunk = (text: string, finishReason?: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] })}\n\n`;

async function run(chunks: string[]) {
  const { encrypt } = await import("@/lib/crypto");
  const { streamGemini } = await import("@/lib/ai/gemini-client");
  vi.stubGlobal("fetch", vi.fn(async () => sseResponse(chunks)));
  const key = encrypt("AIza" + "x".repeat(35));
  const state: { truncated?: boolean } = {};
  let out = "";
  for await (const t of streamGemini(key, "system", [{ role: "user", content: "שאלה" }], undefined, undefined, state)) {
    out += t;
  }
  return { out, state };
}

describe("streamGemini truncation detection", () => {
  it("MAX_TOKENS on the final chunk → state.truncated=true, text intact", async () => {
    const { out, state } = await run([chunk("שלום "), chunk("עולם", "MAX_TOKENS")]);
    expect(out).toBe("שלום עולם");
    expect(state.truncated).toBe(true);
  });

  it("normal STOP finish → truncated stays falsy", async () => {
    const { out, state } = await run([chunk("תשובה "), chunk("שלמה", "STOP")]);
    expect(out).toBe("תשובה שלמה");
    expect(state.truncated).toBeFalsy();
  });

  it("flush: a final data line WITHOUT trailing newline still parses (text + flag)", async () => {
    const last = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "סוף" }] }, finishReason: "MAX_TOKENS" }] })}`;
    const { out, state } = await run([chunk("התחלה "), last]);
    expect(out).toBe("התחלה סוף");
    expect(state.truncated).toBe(true);
  });
});
