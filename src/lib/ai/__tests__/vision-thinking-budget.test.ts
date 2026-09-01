// =========================================================================
// The scanners must not pay for thinking they throw away
// =========================================================================
// Part of "קריאת 3010 איטית". The vision path is TRANSCRIPTION: copy a printed
// table into JSON, invent nothing. `gemini-2.5-flash` — our fallback model —
// turns dynamic thinking ON by default, so it spends seconds of a student's
// wait producing a chain of thought that is discarded before the JSON is
// parsed. `thinkingBudget: 0` is the right budget for extraction.
//
// The risk in that fix is the reason for this file. `thinkingConfig` is a field
// on somebody else's API, shipped days before a launch. A 400 from it would be
// FATAL: the model loop only retries 404 and 429, so a 400 escapes, and the
// route maps 400 to "the Gemini key was rejected" — every scanner in the app
// down, blaming the student's key. So the request is built twice and a 400
// falls back to the plain body.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.ENCRYPTION_KEY ??= "0".repeat(64);

const KEY = "AIza" + "a".repeat(36);

async function encrypted() {
  const { encrypt } = await import("@/lib/crypto");
  return encrypt(KEY);
}

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as unknown as Response;
}
function errResponse(status: number, body: string) {
  return { ok: false, status, text: async () => body } as unknown as Response;
}

describe("the vision call turns thinking off", () => {
  let bodies: string[];

  beforeEach(() => {
    bodies = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const capture = (handler: (n: number) => Response) => {
    let n = 0;
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      return handler(n++);
    });
  };

  it("asks for a zero thinking budget on the happy path", async () => {
    capture(() => okResponse('{"periods":[]}'));
    const { generateGeminiVision } = await import("@/lib/ai/gemini-client");
    await generateGeminiVision(await encrypted(), "sys", "prompt", "AAAA", "image/jpeg");

    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("keeps the scanners alive if Google ever rejects the field", async () => {
    // The whole reason the fallback exists. First body 400s; the retry drops
    // thinkingConfig and succeeds — the student gets their scan, just at the
    // old speed. Never a "your key was rejected" for a key that is fine.
    capture((n) => (n === 0 ? errResponse(400, "Unknown name thinkingConfig") : okResponse("ok")));
    const { generateGeminiVision } = await import("@/lib/ai/gemini-client");
    const out = await generateGeminiVision(await encrypted(), "sys", "prompt", "AAAA", "image/jpeg");

    expect(out).toBe("ok");
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0]!).generationConfig.thinkingConfig).toBeDefined();
    expect(JSON.parse(bodies[1]!).generationConfig.thinkingConfig).toBeUndefined();
    // The retry must still be the same request in every other respect.
    expect(JSON.parse(bodies[1]!).generationConfig.temperature).toBe(0);
    expect(JSON.parse(bodies[1]!).contents).toEqual(JSON.parse(bodies[0]!).contents);
  });

  it("does not swallow a real failure behind the retry", async () => {
    // A genuinely bad key also 400s. The retry is harmless there — it fails the
    // same way — but the error must still reach the route as a 400 so the
    // student is told about their key, not about an outage.
    capture(() => errResponse(400, "API key not valid"));
    const { generateGeminiVision } = await import("@/lib/ai/gemini-client");
    await expect(
      generateGeminiVision(await encrypted(), "sys", "prompt", "AAAA", "image/jpeg"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("does not retry a 429 as if it were a schema problem", async () => {
    // A spent quota is already handled by the model-fallback loop. Retrying the
    // same body would burn another request against a limit we know is spent.
    capture(() => errResponse(429, "quota"));
    const { generateGeminiVision } = await import("@/lib/ai/gemini-client");
    await expect(
      generateGeminiVision(await encrypted(), "sys", "prompt", "AAAA", "image/jpeg"),
    ).rejects.toMatchObject({ status: 429 });
    // One attempt per model in the chain, and no extra no-thinking retry.
    const { GEMINI_MODELS } = await import("@/lib/ai/gemini-client");
    expect(bodies).toHaveLength(GEMINI_MODELS.length);
  });
});
