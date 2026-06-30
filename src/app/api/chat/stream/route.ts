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
  MAX_TOKENS,
  type ChatMessage,
} from "@/lib/ai/claude-client";
import { streamGemini } from "@/lib/ai/gemini-client";
import { detectProvider } from "@/lib/ai/provider";
import { decrypt } from "@/lib/crypto";
import { buildMentorSystemPrompt } from "@/lib/ai/mentor-prompt";
import {
  buildUserContext,
  generateTitle,
  type StoredMessage,
} from "@/lib/ai/context-builder";
import { getProgramById } from "@/lib/programs/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";

// Input validation schema — prevents abuse & injection
const streamInputSchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().min(1).max(10000),
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
          rateLimit: "Rate limit reached. Please wait.",
          overloaded: "The AI service is overloaded. Please try again shortly.",
          generic: "Failed to get response",
          notSaved: "Reply could not be saved — it may disappear on refresh.",
        }
      : {
          invalidKey: "מפתח ה-API שגוי או שפג תוקפו",
          rateLimit: "הגעת למגבלת הבקשות. נסה שוב בעוד רגע.",
          overloaded: "השירות עמוס כעת. נסה שוב בעוד רגע.",
          generic: "שליחת התשובה נכשלה. נסה שוב.",
          notSaved: "לא ניתן היה לשמור את התשובה — ייתכן שהיא תיעלם ברענון.",
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

    const { sessionId, message } = parsed.data;

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

    if (!user.encryptedClaudeKey) {
      return NextResponse.json(
        { error: "No API key configured" },
        { status: 412 }
      );
    }

    // 4. Detect which provider the stored key belongs to (free Gemini or Claude).
    let provider;
    try {
      provider = detectProvider(decrypt(user.encryptedClaudeKey));
    } catch {
      provider = null;
    }
    if (!provider) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 400 }
      );
    }
    const encryptedKey = user.encryptedClaudeKey;

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
    const systemPrompt = buildMentorSystemPrompt(mentorContext, getProgramById(user.programId));

    // 8. Provider-agnostic producer — yields text to `onText` as it streams.
    //    The Claude path keeps its exact SDK calls; the Gemini path streams via
    //    REST. The client is aborted if the user disconnects (request.signal).
    const produce = async (
      onText: (text: string) => void,
      signal: AbortSignal,
    ): Promise<void> => {
      if (provider === "gemini") {
        for await (const text of streamGemini(encryptedKey, systemPrompt, chatHistory, signal)) {
          onText(text);
        }
        return;
      }
      // Claude (unchanged semantics): create client, register text handler, finalize.
      const client = createClaudeClient(encryptedKey);
      const stream = client.messages.stream(
        {
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        },
        { signal }
      );
      stream.on("text", onText);
      await stream.finalMessage();
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
          await produce((text) => {
            fullResponse += text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text })}\n\n`
              )
            );
          }, request.signal);

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
              : status === 429
                ? streamErrors.rateLimit
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
