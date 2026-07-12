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

// Model-fallback (launch hardening): a retired model (404) or a spent shared
// quota (429) falls through to the next model; a real error (401) does NOT
// waste a retry; all-fail rethrows the last status so the route can map it to
// the honest "resting" state.
const errorResponse = (status: number): Response => new Response("err", { status });

async function streamAll(key: string): Promise<string> {
  const { streamGemini } = await import("@/lib/ai/gemini-client");
  let out = "";
  for await (const t of streamGemini(key, "system", [{ role: "user", content: "שאלה" }])) out += t;
  return out;
}

describe("streamGemini model fallback", () => {
  async function makeKey() {
    const { encrypt } = await import("@/lib/crypto");
    return encrypt("AIza" + "x".repeat(35));
  }

  it("falls through a retired model (404) to the next and streams its text", async () => {
    const key = await makeKey();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(404))
      .mockResolvedValueOnce(sseResponse([chunk("שלום", "STOP")]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await streamAll(key)).toBe("שלום");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through a spent quota (429) to the next", async () => {
    const key = await makeKey();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(sseResponse([chunk("היי", "STOP")]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await streamAll(key)).toBe("היי");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a real error (401) — throws immediately after one fetch", async () => {
    const key = await makeKey();
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(streamAll(key)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("all models retired → throws {status:404} so the route shows 'resting'", async () => {
    const key = await makeKey();
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404));
    vi.stubGlobal("fetch", fetchMock);
    await expect(streamAll(key)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("generateGeminiVision also falls through 404 to the next model", async () => {
    const key = await makeKey();
    const { generateGeminiVision } = await import("@/lib/ai/gemini-client");
    const visionOk = new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "טקסט" }] } }] }),
      { status: 200 },
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse(404)).mockResolvedValueOnce(visionOk);
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateGeminiVision(key, "sys", "prompt", "base64data", "image/png")).toBe("טקסט");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
