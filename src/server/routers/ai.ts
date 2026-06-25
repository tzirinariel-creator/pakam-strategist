// =========================================
// AI Router — Claude API BYOK + Chat
// =========================================
// Manages API key storage, chat sessions,
// and non-streaming Claude API calls.

import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  createClaudeClient,
  validateApiKey,
  maskApiKey,
  CLAUDE_MODEL,
  MAX_TOKENS,
  type ChatMessage,
} from "@/lib/ai/claude-client";
import { buildMentorSystemPrompt } from "@/lib/ai/mentor-prompt";
import {
  buildUserContext,
  extractResponseText,
  generateTitle,
  type StoredMessage,
} from "@/lib/ai/context-builder";
import { getProgramById } from "@/lib/programs/registry";

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Look up the internal User record from the Supabase auth userId.
 * Throws NOT_FOUND if the user doesn't exist.
 */
async function getUser(db: typeof import("@/lib/db").prisma, userId: string) {
  const user = await db.user.findUnique({
    where: { supabaseId: userId },
  });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  return user;
}

// -------------------------------------------------------------------
// Router
// -------------------------------------------------------------------

export const aiRouter = createTRPCRouter({
  // =================================================================
  // 1. saveApiKey — encrypt and store a Claude API key
  // =================================================================
  saveApiKey: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(1, "API key is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trimmedKey = input.apiKey.trim();

      // Validate format.
      if (!validateApiKey(trimmedKey)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            'Invalid API key format. Anthropic keys start with "sk-ant-".',
        });
      }

      const user = await getUser(ctx.db, ctx.userId);

      // Encrypt and save.
      const encryptedKey = encrypt(trimmedKey);
      await ctx.db.user.update({
        where: { id: user.id },
        data: { encryptedClaudeKey: encryptedKey },
      });

      return {
        success: true as const,
        masked: maskApiKey(trimmedKey),
      };
    }),

  // =================================================================
  // 2. removeApiKey — remove stored API key
  // =================================================================
  removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await getUser(ctx.db, ctx.userId);

    await ctx.db.user.update({
      where: { id: user.id },
      data: { encryptedClaudeKey: null },
    });

    return { success: true as const };
  }),

  // =================================================================
  // 3. hasApiKey — check if user has a stored API key
  // =================================================================
  hasApiKey: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUser(ctx.db, ctx.userId);

    if (!user.encryptedClaudeKey) {
      return { hasKey: false as const, masked: null };
    }

    // Decrypt to mask the original key for display.
    try {
      const decrypted = decrypt(user.encryptedClaudeKey);
      return { hasKey: true as const, masked: maskApiKey(decrypted) };
    } catch {
      // If decryption fails, the stored key is corrupt. Clear it.
      await ctx.db.user.update({
        where: { id: user.id },
        data: { encryptedClaudeKey: null },
      });
      return { hasKey: false as const, masked: null };
    }
  }),

  // =================================================================
  // 4. chat — send a message and get an AI response (non-streaming)
  // =================================================================
  chat: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid().optional(),
        message: z.string().min(1).max(10000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUser(ctx.db, ctx.userId);

      // --- Ensure the user has an API key ---
      if (!user.encryptedClaudeKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No Claude API key found. Please add your API key in Settings.",
        });
      }

      // --- Create the Claude client ---
      let client;
      try {
        client = createClaudeClient(user.encryptedClaudeKey);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Failed to initialize Claude client. Your API key may be invalid. Please re-enter it in Settings.",
        });
      }

      // --- Load or create chat session ---
      let session: {
        id: string;
        title: string | null;
        messages: unknown[];
      };

      if (input.sessionId) {
        // Load existing session.
        const existing = await ctx.db.chatSession.findUnique({
          where: { id: input.sessionId },
        });

        if (!existing || existing.userId !== user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Chat session not found",
          });
        }

        session = {
          id: existing.id,
          title: existing.title,
          messages: existing.messages as unknown[],
        };
      } else {
        // Create a new session.
        const created = await ctx.db.chatSession.create({
          data: {
            userId: user.id,
            persona: "mentor",
            title: generateTitle(input.message),
            messages: [],
          },
        });

        session = {
          id: created.id,
          title: created.title,
          messages: [],
        };
      }

      // --- Build message history ---
      const storedMessages = session.messages as StoredMessage[];
      const chatHistory: ChatMessage[] = storedMessages
        .filter(
          (m): m is StoredMessage & { role: "user" | "assistant" } =>
            m.role === "user" || m.role === "assistant"
        )
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Append the new user message.
      chatHistory.push({ role: "user", content: input.message });

      // --- Build system prompt with user context ---
      const mentorContext = await buildUserContext(ctx.db, user);
      const systemPrompt = buildMentorSystemPrompt(mentorContext, getProgramById(user.programId));

      // --- Call Claude API ---
      let responseText: string;
      try {
        const response = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: chatHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        responseText = extractResponseText(
          response.content as Array<{ type: string; text?: string }>
        );

        if (!responseText) {
          throw new Error("Empty response from Claude API");
        }
      } catch (err: unknown) {
        const apiError = err as { status?: number };
        // Handle specific Anthropic API errors.
        if (apiError?.status === 401) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Claude API key is invalid or expired. Please update it in Settings.",
          });
        }
        if (apiError?.status === 429) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Rate limit reached on Claude API. Please wait a moment and try again.",
          });
        }
        if (apiError?.status === 529) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Claude API is currently overloaded. Please try again shortly.",
          });
        }
        // Re-throw TRPCErrors as-is.
        if (err instanceof TRPCError) throw err;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get a response from Claude. Please try again.",
        });
      }

      // --- Save messages to session ---
      const now = new Date().toISOString();
      const newMessages: StoredMessage[] = [
        ...storedMessages,
        { role: "user", content: input.message, timestamp: now },
        { role: "assistant", content: responseText, timestamp: now },
      ];

      // Update the title on the first exchange if it wasn't set.
      const updatedTitle = session.title ?? generateTitle(input.message);

      await ctx.db.chatSession.update({
        where: { id: session.id },
        data: {
          messages: newMessages as unknown as object[],
          title: updatedTitle,
          context: mentorContext as object,
        },
      });

      return {
        sessionId: session.id,
        response: responseText,
        title: updatedTitle,
      };
    }),

  // =================================================================
  // 5. getChatSessions — list user's chat sessions
  // =================================================================
  getChatSessions: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUser(ctx.db, ctx.userId);

    const sessions = await ctx.db.chatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    });

    return sessions.map(
      (s: { id: string; title: string | null; createdAt: Date; updatedAt: Date; messages: unknown[] }) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
      })
    );
  }),

  // =================================================================
  // 6. getChatSession — get a specific session with messages
  // =================================================================
  getChatSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await getUser(ctx.db, ctx.userId);

      const session = await ctx.db.chatSession.findUnique({
        where: { id: input.sessionId },
      });

      if (!session || session.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chat session not found",
        });
      }

      return {
        id: session.id,
        title: session.title,
        persona: session.persona,
        messages: session.messages as unknown as StoredMessage[],
        context: session.context,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    }),

  // =================================================================
  // 7. deleteChatSession — delete a chat session
  // =================================================================
  deleteChatSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUser(ctx.db, ctx.userId);

      const session = await ctx.db.chatSession.findUnique({
        where: { id: input.sessionId },
      });

      if (!session || session.userId !== user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chat session not found",
        });
      }

      await ctx.db.chatSession.delete({
        where: { id: session.id },
      });

      return { success: true as const };
    }),

  // =================================================================
  // 8. recommendNextSemester — AI-powered course recommendations
  // =================================================================
  recommendNextSemester: protectedProcedure
    .input(
      z
        .object({
          maxCredits: z.number().min(4).max(30).optional(),
          preferredDiscipline: z.string().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUser(ctx.db, ctx.userId);

      // Ensure the user has an API key.
      if (!user.encryptedClaudeKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No Claude API key found. Please add your API key in Settings.",
        });
      }

      let client;
      try {
        client = createClaudeClient(user.encryptedClaudeKey);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Failed to initialize Claude client. Your API key may be invalid.",
        });
      }

      // Build full user context.
      const mentorContext = await buildUserContext(ctx.db, user);

      const maxCredits = input?.maxCredits ?? 22;
      const preferredDiscipline = input?.preferredDiscipline ?? null;

      // Build a focused recommendation prompt.
      const program = getProgramById(user.programId);
      const difficultyLabel = (level: string | null | undefined): string => {
        if (!level) return "";
        const labels: Record<string, string> = { easy: "קל", moderate: "בינוני", hard: "קשה", very_hard: "קשה מאוד" };
        return labels[level] ?? "";
      };

      const availableList = mentorContext.availableNextSemester
        .map((c) => {
          const parts = [`  • ${c.nameHe} (${c.code})`, c.discipline, `${c.credits} ש"ס`];
          const diff = difficultyLabel(c.difficultyLevel);
          if (diff) parts.push(`קושי: ${diff}`);
          if (c.averageGrade) parts.push(`ממוצע: ${c.averageGrade}`);
          return parts.join(" | ");
        })
        .join("\n");

      const completedList = mentorContext.completedCourses
        .map((c) => {
          const parts = [`  • ${c.nameHe} (${c.code})`, `ציון: ${c.grade ?? "—"}`];
          const diff = difficultyLabel(c.difficultyLevel);
          if (diff) parts.push(`(${diff})`);
          return parts.join(" | ");
        })
        .join("\n");

      const recommendationPrompt = `אתה יועץ אקדמי של תוכנית ${program.nameHe}. הסטודנט מבקש המלצה לקורסים לסמסטר הבא.

## נתוני הסטודנט
- שנה ${mentorContext.currentYear}, ${mentorContext.currentSemester}
- תחום התמחות: ${mentorContext.focusArea ?? "לא נבחר"}
- ש"ס שנצברו: ${mentorContext.earnedCredits}
- ממוצע: ${mentorContext.courseAverage?.toFixed(1) ?? "אין"}
- ש"ס בתחום ההתמחות: ${mentorContext.focusAreaCredits}
- מקסימום ש"ס מבוקש לסמסטר: ${maxCredits}
${preferredDiscipline ? `- העדפת דיסציפלינה: ${preferredDiscipline}` : ""}

## קורסים שהושלמו
${completedList || "  (אין)"}

## קורסים זמינים (עומד בדרישות קדם)
${availableList || "  (אין קורסים זמינים)"}

## הוראות
בחר 4-6 קורסים מהרשימה הזמינה שמתאימים לסטודנט. שקול:
1. איזון דיסציפלינות (לא יותר מדי מתחום אחד)
2. עומס ש"ס סביר (לא לחרוג מ-${maxCredits})
3. **איזון קושי** — אל תשלב יותר מ-2 קורסים קשים/קשים מאוד באותו סמסטר. העדף מיקס של קל+בינוני+קשה
4. דרישות רגולטוריות חסרות
5. העדפת הסטודנט (אם צוינה)
6. בניית בסיס חזק לשנים הבאות

ענה בפורמט JSON בלבד (בלי markdown):
{
  "recommendations": [
    {
      "code": "קוד הקורס",
      "nameHe": "שם הקורס",
      "credits": 4,
      "discipline": "${program.disciplines[0]?.id ?? "DISCIPLINE_ID"}",
      "reason": "נימוק קצר בעברית למה הקורס מתאים"
    }
  ],
  "totalCredits": 20,
  "summary": "סיכום כללי של ההמלצה בעברית — 2-3 משפטים"
}`;

      try {
        const response = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 2000,
          system: "אתה יועץ אקדמי. ענה בפורמט JSON בלבד.",
          messages: [{ role: "user", content: recommendationPrompt }],
        });

        const responseText = extractResponseText(
          response.content as Array<{ type: string; text?: string }>
        );

        // Parse JSON response — strip possible markdown fences.
        const cleaned = responseText
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();

        const parsed = JSON.parse(cleaned) as {
          recommendations: Array<{
            code: string;
            nameHe: string;
            credits: number;
            discipline: string;
            reason: string;
          }>;
          totalCredits: number;
          summary: string;
        };

        return {
          success: true as const,
          recommendations: parsed.recommendations,
          totalCredits: parsed.totalCredits,
          summary: parsed.summary,
        };
      } catch (err: unknown) {
        const apiError = err as { status?: number };
        if (apiError?.status === 401) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Claude API key is invalid or expired.",
          });
        }
        if (err instanceof SyntaxError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to parse AI recommendation. Please try again.",
          });
        }
        if (err instanceof TRPCError) throw err;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get recommendations. Please try again.",
        });
      }
    }),
});
