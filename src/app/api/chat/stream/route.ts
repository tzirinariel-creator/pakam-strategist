// =========================================
// Streaming Chat API Route
// =========================================
// Returns a ReadableStream of Claude responses,
// enabling word-by-word display in the chat UI.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import {
  createClaudeClient,
  CLAUDE_MODEL,
  type ChatMessage,
} from "@/lib/ai/claude-client";
import { streamGemini } from "@/lib/ai/gemini-client";
import { detectProvider } from "@/lib/ai/provider";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  buildMentorSystemPrompt,
  buildDeterministicHintBlock,
  isSafeDeterministicHint,
  type MentorPersona,
} from "@/lib/ai/mentor-prompt";
import {
  buildUserContext,
  generateTitle,
  type StoredMessage,
} from "@/lib/ai/context-builder";
import { getProgramById } from "@/lib/programs/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";

// Chat-only Claude tuning (BYOK users). Mirrors the Gemini chat path: the
// token cap is a SAFETY NET only (brevity is enforced by the answer contract
// in the prompt — 800 used to cut planning answers mid-word, owner note #36),
// and a moderate temperature keeps the King's voice human rather than robotic.
const CHAT_MAX_TOKENS = 2000;
const CHAT_TEMPERATURE = 0.6;

// Input validation schema — prevents abuse & injection
const CHAT_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const streamInputSchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().min(1).max(10000),
  // The client router's verified answer for THIS question, when it matched.
  deterministicHint: z.string().max(2000).optional(),
  // Optional attached image ("photo & ask") — Gemini vision only.
  imageBase64: z.string().min(100).max(5_000_000).optional(),
  imageMime: z.string().refine((m) => CHAT_IMAGE_MIME.has(m), "Unsupported image type").optional(),
  // Advisor persona — a validated client preference (stored per-device for now;
  // moves to the profile when the mentorPersona column migration runs).
  persona: z.enum(["king", "referent"]).optional(),
});

// -------------------------------------------------------------------
// POST handler — streaming chat
// -------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // User-facing streaming error messages. The mentor UI is Hebrew-first, so we
  // localize the human-readable text (status codes / semantics are unchanged).
  // Respect the request locale via the NEXT_LOCALE cookie (same pattern used by
  // the other API routes), defaulting to Hebrew.
  const locale = request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "he";
  const streamErrors =
    locale === "en"
      ? {
          invalidKey: "API key is invalid or expired",
          rateLimit: "You've hit the usage limit for now. The free tier has a quota — try again in a minute (or later if you reached the daily cap).",
          overloaded: "The AI service is overloaded. Please try again shortly.",
          generic: "Failed to get response",
          notSaved: "Reply could not be saved — it may disappear on refresh.",
          truncated: 'I stopped before the end — type "continue" and I\'ll pick up from there.',
          // Every fallback model is retired (404) or the shared free quota is
          // spent (429) — an honest, persona-neutral rest state, not a raw error.
          resting: "The assistant is unavailable right now — try again later. You can add your own free key in settings to skip the wait.",
        }
      : {
          invalidKey: "מפתח ה-API שגוי או שפג תוקפו",
          rateLimit: "הגעת למגבלת השימוש כרגע. בשכבה החינמית של Gemini יש מכסה — נסו שוב בעוד דקה (או מאוחר יותר אם הגעתם למכסה היומית).",
          overloaded: "השירות עמוס כעת. נסה שוב בעוד רגע.",
          generic: "שליחת התשובה נכשלה. נסה שוב.",
          notSaved: "לא ניתן היה לשמור את התשובה — ייתכן שהיא תיעלם ברענון.",
          truncated: 'נעצרתי לפני הסוף. כתבו "המשך" ואמשיך מאותה נקודה.',
          resting: "היועץ לא זמין כרגע — נסו שוב מאוחר יותר. אפשר להוסיף מפתח חינמי משלכם בהגדרות כדי לא לחכות.",
        };

  try {
    // 1. Auth check
    const supabase = await createServerSupabase();
    // Validate the JWT against the auth server (not just the cookie) for authorization.
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Demo account is read-only. The chat stream is a write/abuse path — it
    // persists chat sessions and would burn the shared Claude key — so reject
    // the demo user here too (this is a Next route, not a tRPC mutation, so it
    // needs its own guard). Matched by the verified session email.
    if (isDemoEmail(authUser.email)) {
      return NextResponse.json(
        { error: DEMO_READONLY_MESSAGE },
        { status: 403 }
      );
    }

    // Rate limit: 20 requests per minute per user
    const rateLimit = checkRateLimit(`chat:${authUser.id}`, {
      maxRequests: 20,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetInSeconds) } }
      );
    }

    // 2. Parse & validate body
    const body = await request.json();
    const parsed = streamInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { sessionId, message, deterministicHint, imageBase64, imageMime, persona } = parsed.data;
    const hasImage = !!(imageBase64 && imageMime);

    // 3. Get user
    const user = await prisma.user.findUnique({
      where: { supabaseId: authUser.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 3b. Resolve the key: the student's own BYOK key first, else the app's
    // SHARED free Gemini key (Ariel's, with billing OFF so it can never be
    // charged — Google just returns 429 past the free quota). This makes the
    // assistant work with zero setup while a student who wants no limits can
    // add their own free key.
    let encryptedKey: string;
    let usingSharedKey = false;
    if (user.encryptedClaudeKey) {
      encryptedKey = user.encryptedClaudeKey;
    } else if (process.env.GEMINI_SHARED_KEY) {
      usingSharedKey = true;
      encryptedKey = encrypt(process.env.GEMINI_SHARED_KEY);
    } else {
      return NextResponse.json(
        { error: "No API key configured" },
        { status: 412 }
      );
    }

    // Protect the shared free-tier pool: soft per-user + global daily caps so
    // one student can't drain it. This is fairness only — the HARD guarantee
    // against any charge is billing-off on the shared key's Google project.
    if (usingSharedKey) {
      const perUser = checkRateLimit(`shared-day:${authUser.id}`, {
        maxRequests: 40,
        windowSeconds: 86_400,
      });
      const global = checkRateLimit("shared-day:__global__", {
        maxRequests: 800,
        windowSeconds: 86_400,
      });
      if (!perUser.allowed || !global.allowed) {
        return NextResponse.json(
          {
            error:
              "העוזר המשותף עמוס כרגע — אפשר להוסיף מפתח חינמי משלך בהגדרות.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(perUser.resetInSeconds, global.resetInSeconds)
              ),
            },
          }
        );
      }
    }

    // 4. Detect which provider the resolved key belongs to (free Gemini or Claude).
    let provider;
    try {
      provider = detectProvider(decrypt(encryptedKey));
    } catch {
      provider = null;
    }
    if (!provider) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 400 }
      );
    }

    // Image chat is Gemini-vision only (the shared free key is Gemini). A Claude
    // BYOK user gets a clear, honest boundary instead of a silent drop.
    if (hasImage && provider !== "gemini") {
      return NextResponse.json(
        {
          error:
            locale === "en"
              ? "Image questions need a Google Gemini key. Add a free one in settings (or remove your Claude key to use the shared Gemini key)."
              : "שאלות עם תמונה עובדות עם מפתח Gemini של גוגל. הוסיפו מפתח חינמי בהגדרות (או הסירו את מפתח Claude כדי להשתמש במפתח המשותף).",
        },
        { status: 415 }
      );
    }

    // 5. Load or create chat session
    let chatSession: {
      id: string;
      title: string | null;
      messages: unknown[];
    };

    if (sessionId) {
      const existing = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });

      if (!existing || existing.userId !== user.id) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      chatSession = {
        id: existing.id,
        title: existing.title,
        messages: existing.messages as unknown[],
      };
    } else {
      const created = await prisma.chatSession.create({
        data: {
          userId: user.id,
          persona: "mentor",
          title: generateTitle(message.trim()),
          messages: [],
        },
      });

      chatSession = {
        id: created.id,
        title: created.title,
        messages: [],
      };
    }

    // 6. Build message history
    const storedMessages = chatSession.messages as StoredMessage[];
    const chatHistory: ChatMessage[] = storedMessages
      .filter(
        (m): m is StoredMessage & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant"
      )
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    chatHistory.push({ role: "user", content: message.trim() });

    // 7. Build system prompt
    const mentorContext = await buildUserContext(prisma, user);
    // Append the client router's answer (if any) as a reference block. The
    // hint is client-supplied body text, so it is gated (a bidding-prediction
    // shape drops it entirely) and the block itself subordinates it to the
    // safety rules and the server-computed status.
    const safeHint =
      deterministicHint && isSafeDeterministicHint(deterministicHint)
        ? deterministicHint
        : undefined;
    const systemPrompt =
      buildMentorSystemPrompt(mentorContext, getProgramById(user.programId), (persona as MentorPersona) ?? "king") +
      (safeHint ? buildDeterministicHintBlock(safeHint) : "");

    // 8. Provider-agnostic producer — yields text to `onText` as it streams.
    //    The Claude path keeps its exact SDK calls; the Gemini path streams via
    //    REST. The client is aborted if the user disconnects (request.signal).
    //    Returns TRUE when the provider stopped on its token cap (#36) so the
    //    stream can say so honestly instead of ending mid-word.
    const produce = async (
      onText: (text: string) => void,
      signal: AbortSignal,
    ): Promise<boolean> => {
      if (provider === "gemini") {
        const image = hasImage ? { base64: imageBase64!, mimeType: imageMime! } : undefined;
        const state: { truncated?: boolean } = {};
        for await (const text of streamGemini(encryptedKey, systemPrompt, chatHistory, signal, image, state)) {
          onText(text);
        }
        return state.truncated === true;
      }
      // Claude (unchanged semantics): create client, register text handler, finalize.
      const client = createClaudeClient(encryptedKey);
      const stream = client.messages.stream(
        {
          model: CLAUDE_MODEL,
          // The cap is a safety net; brevity comes from the answer contract.
          max_tokens: CHAT_MAX_TOKENS,
          temperature: CHAT_TEMPERATURE,
          system: systemPrompt,
          messages: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        },
        { signal }
      );
      stream.on("text", onText);
      const final = await stream.finalMessage();
      return final.stop_reason === "max_tokens";
    };

    // 9. Create a ReadableStream that forwards events
    let fullResponse = "";
    const sessionIdForClient = chatSession.id;
    const titleForClient = chatSession.title ?? generateTitle(message.trim());

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeClose = () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        };
        try {
          // Send session metadata first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "meta", sessionId: sessionIdForClient, title: titleForClient })}\n\n`
            )
          );

          // Stream text deltas (Claude or Gemini, same forwarding).
          const truncated = await produce((text) => {
            fullResponse += text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text })}\n\n`
              )
            );
          }, request.signal);

          // Honesty on truncation (#36): if the cap still cut the answer, say
          // so and invite "המשך" — the history is persisted, so continuing works.
          if (truncated && fullResponse.trim()) {
            const note = `\n\n${streamErrors.truncated}`;
            fullResponse += note; // persisted too — the record stays honest
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: note })}\n\n`
              )
            );
            // Typed event so the client can skip caching a cut answer — a
            // cached "המשך" invitation would reach a King with no history.
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "truncated" })}\n\n`)
            );
          }

          // A response that produced NO text (Gemini SAFETY/RECITATION block, an
          // empty candidate, or a promptFeedback.blockReason) must surface as an
          // error — not a silent empty bubble that also gets persisted as a blank
          // assistant turn (#audit-r2).
          if (!fullResponse.trim()) {
            if (!closed) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", error: streamErrors.generic })}\n\n`)
              );
            }
            safeClose();
            return;
          }

          // Persist BEFORE closing the stream, so a DB failure is surfaced to the
          // user instead of silently losing a reply they already saw on screen.
          const now = new Date().toISOString();
          const newMessages: StoredMessage[] = [
            ...storedMessages,
            { role: "user", content: message.trim(), timestamp: now },
            { role: "assistant", content: fullResponse, timestamp: now },
          ];

          try {
            await prisma.chatSession.update({
              where: { id: sessionIdForClient },
              data: {
                messages: newMessages as unknown as object[],
                title: titleForClient,
                context: mentorContext as object,
              },
            });
          } catch (dbErr) {
            console.error("Failed to persist chat session:", dbErr);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: streamErrors.notSaved })}\n\n`
              )
            );
          }

          // Send done event, then close.
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          safeClose();
        } catch (err: unknown) {
          const apiError = err as { status?: number };
          const status = apiError?.status;
          const errorMessage =
            status === 401 || status === 403 || status === 400
              ? streamErrors.invalidKey
              : status === 404
                ? streamErrors.resting // every fallback model retired → honest rest
                : status === 429
                  ? // a BYOK user's own 429 is their quota; the shared key's 429
                    // means everyone is tapped out — show the rest state, not "you".
                    usingSharedKey
                    ? streamErrors.resting
                    : streamErrors.rateLimit
                  : status === 529 || status === 503 || status === 500
                    ? streamErrors.overloaded
                    : streamErrors.generic;

          // Guard against a controller that may already be closed.
          if (!closed) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
              )
            );
          }
          safeClose();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    console.error("Stream route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
