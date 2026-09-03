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
// Ordered FREE-tier fallback chain. Try [0]; on 404 (a retired model) or 429
// (a spent quota) fall through to the next. All IDs MUST be currently free +
// live — Google retires Flash models. An optional GEMINI_MODEL env override
// makes the PRIMARY hot-fixable without a deploy (de-duped so it isn't tried
// twice). See memory: gemini-model-must-stay-current.
//
// 3.9 — למה הרשימה כוללת עכשיו גם שמות "latest".
//
// אריאל עבר את זרימת ההרשמה כמשתמש וקיבל *"הסורק אינו זמין כרגע"* בהעלאת
// טופס 3010. זה 503, כלומר הספק ענה 404 על **כל** המודלים ברשימה. שני
// השמות שהיו כאן מוצמדים לגרסה, וגוגל מוציאה גרסאות Flash משירות — בדיוק
// מה שקרה ב-3.3.2026 למודל שהיה לפניהם.
//
// הצ'יין עצמו היה תקין: הוא מנסה מודל אחר על 404. מה שנשבר זו **הרשימה** —
// כל האיברים בה מתיישנים באותו קצב, ולכן היום שבו הראשון מת הוא בערך היום
// שבו השני מת. וכשכולם מתים, לא רק הסורק נופל: המלך נופל איתו.
//
// `gemini-flash-lite-latest` ו-`gemini-flash-latest` הם כינויים שגוגל
// מפנה תמיד לגרסה החיה. הם נשארים **אחרי** המוצמדים, כדי ששום דבר לא
// ישתנה כל עוד המוצמדים חיים — אבל ברגע שהם ימותו, הכינוי תופס את זה
// לבד במקום שהאפליקציה תחשיך.
const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-flash-latest",
] as const;
export const GEMINI_MODELS: string[] = Array.from(
  new Set([process.env.GEMINI_MODEL?.trim(), ...DEFAULT_GEMINI_MODELS].filter(Boolean) as string[]),
);
/** Primary model — kept for the health route + back-compat. */
export const GEMINI_MODEL = GEMINI_MODELS[0]!;

const GEMINI_MAX_TOKENS = 4096;

// Chat-only tuning (streamGemini is the King's chat; the scanners use
// generateGeminiVision and stay deterministic). A moderate temperature makes
// the voice human instead of robotic. The token cap is a SAFETY NET only —
// brevity is enforced by the answer contract in the prompt, not a guillotine:
// 800 used to cut legitimate exam-planning answers mid-word (owner note #36).
const GEMINI_CHAT_TEMPERATURE = 0.55;
const GEMINI_CHAT_MAX_TOKENS = 2000;

/** Google AI Studio keys: legacy "AIza…" or the newer "AQ.…" auth keys. */
export function validateGeminiKey(key: string): boolean {
  return /^(AIza[0-9A-Za-z_-]{30,}|AQ\.[A-Za-z0-9._-]{20,})$/.test(key.trim());
}

interface GeminiStreamChunk {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
}

/**
 * POST to Gemini, trying each model in GEMINI_MODELS until one responds OK.
 * Only a retired model (404) or a spent quota (429) is worth another model —
 * any other status (bad key, 400, 5xx) is a real error, so stop and throw it.
 * Throws { status, message } (the LAST failure) when every model fails, so the
 * route maps 404/429 to the honest "resting" state.
 */
async function geminiFetchWithFallback(
  suffix: string,
  body: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Response> {
  let last: { status: number; message: string } = { status: 500, message: "Gemini request failed" };
  const wantsStream = suffix.includes("streamGenerateContent");
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}${suffix}`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body, signal },
    );
    if (res.ok && (!wantsStream || res.body)) return res;
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* status is enough */
    }
    last = { status: res.status || 500, message: detail || "Gemini request failed" };
    // Only a retired model or a spent quota is worth trying the next model.
    if (res.status !== 404 && res.status !== 429) break;
  }
  throw last;
}

/**
 * One-shot VISION call (image → text), non-streaming. Used by the AI scanners
 * (grade sheet / syllabus). Same free-tier model, same header auth; throws
 * { status, message } like streamGemini so routes map errors uniformly.
 */
export async function generateGeminiVision(
  encryptedKey: string,
  system: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const apiKey = decrypt(encryptedKey);
  if (!validateGeminiKey(apiKey)) {
    throw { status: 400, message: "Invalid Gemini key format" };
  }

  // The scanners TRANSCRIBE — they copy a printed table into JSON. There is
  // nothing to reason about, and the answer contract forbids inferring anything
  // that is not on the page. `gemini-2.5-flash` (our fallback model) turns
  // dynamic thinking ON by default, spending seconds of the student's wait on a
  // chain of thought that is then discarded. Zero is the right budget here.
  //
  // But `thinkingConfig` is a field on someone else's API on the eve of a
  // launch, and a 400 from it would take BOTH scanners down — a 400 is not
  // retryable in the model loop above, and the route would tell the student
  // their key was rejected. So the request is built twice and a 400 falls back
  // to the plain body: worst case we are exactly as fast as before, never
  // broken.
  const body = (withThinking: boolean) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_TOKENS,
        temperature: 0,
        ...(withThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });

  let res: Response;
  try {
    res = await geminiFetchWithFallback(":generateContent", body(true), apiKey);
  } catch (e) {
    if ((e as { status?: number })?.status !== 400) throw e;
    res = await geminiFetchWithFallback(":generateContent", body(false), apiKey);
  }

  const data = (await res.json()) as GeminiStreamChunk;
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
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
  /** Optional image attached to the CURRENT (last) user turn — "photo & ask". */
  image?: { base64: string; mimeType: string },
  /** Out-param: truncated=true on MAX_TOKENS (#36); blocked=true when Gemini
   *  ends on a terminal reason with NO text (RECITATION/SAFETY/OTHER) — the
   *  "crash" the King hit when it echoed a long course list (QA 13.7). The route
   *  already surfaces the empty response as an error; this flag records why. */
  state?: { truncated?: boolean; blocked?: boolean },
): AsyncGenerator<string> {
  const apiKey = decrypt(encryptedKey);
  if (!validateGeminiKey(apiKey)) {
    throw { status: 400, message: "Invalid Gemini key format" };
  }

  // Gemini uses role "model" for the assistant; "user" stays "user".
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }] as ({ text: string } | { inline_data: { mime_type: string; data: string } })[],
  }));
  // Attach the image to the last user turn so the model answers about it.
  if (image && contents.length > 0) {
    contents[contents.length - 1]!.parts.push({
      inline_data: { mime_type: image.mimeType, data: image.base64 },
    });
  }

  // The key goes in the x-goog-api-key header (works for both legacy AIza and
  // the new AQ. auth keys) and keeps the secret out of URLs/logs. The helper
  // retries across GEMINI_MODELS on a retired/quota failure BEFORE any byte
  // streams — once the reader starts there is no safe retry (and none needed:
  // every failure is reported on the initial non-OK response).
  const res = await geminiFetchWithFallback(
    ":streamGenerateContent?alt=sse",
    JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: GEMINI_CHAT_MAX_TOKENS,
        temperature: GEMINI_CHAT_TEMPERATURE,
      },
    }),
    apiKey,
    signal,
  );

  // The response is a Server-Sent-Events stream of partial JSON candidates.
  // res.body is guaranteed non-null by the helper (it rejects a bodyless stream).
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Shared by the loop and the final flush — the LAST chunk is where Gemini
  // reports finishReason, so it must be parsed even without a trailing newline.
  const parseLine = function* (line: string): Generator<string> {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const json = trimmed.slice(5).trim();
    if (!json || json === "[DONE]") return;
    try {
      const obj = JSON.parse(json) as GeminiStreamChunk;
      const cand = obj.candidates?.[0];
      if (cand?.finishReason === "MAX_TOKENS" && state) state.truncated = true;
      else if (
        cand?.finishReason &&
        cand.finishReason !== "STOP" &&
        cand.finishReason !== "MAX_TOKENS"
      ) {
        // RECITATION / SAFETY / OTHER — a terminal block with no usable text.
        console.error("[gemini] terminal finishReason with no usable text:", cand.finishReason);
        if (state) state.blocked = true;
      }
      const parts = cand?.content?.parts;
      if (Array.isArray(parts)) {
        const text = parts.map((p) => p.text ?? "").join("");
        if (text) yield text;
      }
    } catch {
      // ignore keep-alive / partial lines that aren't valid JSON yet
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (possibly partial) line in the buffer.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      yield* parseLine(line);
    }
  }
  // Flush: a final data: line without a trailing newline would otherwise be
  // dropped — losing both its text and the finishReason honesty signal.
  if (buffer.trim()) {
    yield* parseLine(buffer);
  }
}
