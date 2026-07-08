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
  detectProvider,
  validateAnyApiKey,
  maskAnyApiKey,
} from "@/lib/ai/provider";
import {
  type StoredMessage,
} from "@/lib/ai/context-builder";

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

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

      // Validate format — accept EITHER a free Gemini key (AIza…) or a Claude
      // key (sk-ant-…). The provider is inferred from the prefix.
      if (!validateAnyApiKey(trimmedKey)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            'מפתח לא תקין. הדביקו מפתח Gemini חינמי מ-Google AI Studio (מתחיל ב-AQ. או ב-AIza), או מפתח Claude (מתחיל ב-sk-ant).',
        });
      }

      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      // Encrypt and save (same encrypted column stores either provider's key).
      const encryptedKey = encrypt(trimmedKey);
      await ctx.db.user.update({
        where: { id: user.id },
        data: { encryptedClaudeKey: encryptedKey },
      });

      return {
        success: true as const,
        masked: maskAnyApiKey(trimmedKey),
        provider: detectProvider(trimmedKey),
      };
    }),

  // =================================================================
  // 2. removeApiKey — remove stored API key
  // =================================================================
  removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
    const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

    // Whether the app has a SHARED free key configured — the assistant works
    // with zero setup when it does, even if the student has no personal key.
    const sharedAvailable = !!process.env.GEMINI_SHARED_KEY;

    if (!user.encryptedClaudeKey) {
      return { hasKey: false as const, masked: null, provider: null, sharedAvailable };
    }

    // Decrypt to mask the original key for display + report which provider.
    try {
      const decrypted = decrypt(user.encryptedClaudeKey);
      return {
        hasKey: true as const,
        masked: maskAnyApiKey(decrypted),
        provider: detectProvider(decrypted),
        sharedAvailable,
      };
    } catch {
      // If decryption fails, the stored key is corrupt. Clear it.
      await ctx.db.user.update({
        where: { id: user.id },
        data: { encryptedClaudeKey: null },
      });
      return { hasKey: false as const, masked: null, provider: null, sharedAvailable };
    }
  }),

  // =================================================================
  // 5. getChatSessions — list user's chat sessions
  // =================================================================
  getChatSessions: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

    // The sidebar renders only the title + message COUNT, so compute the count
    // in Postgres (array_length on the jsonb[] column) instead of shipping every
    // session's full messages blob back just to call .length on it (perf).
    const rows = await ctx.db.$queryRaw<
      { id: string; title: string | null; createdAt: Date; updatedAt: Date; messageCount: number | bigint }[]
    >`
      SELECT id, title, "createdAt", "updatedAt",
             COALESCE(array_length(messages, 1), 0)::int AS "messageCount"
      FROM chat_sessions
      WHERE "userId" = ${user.id}
      ORDER BY "updatedAt" DESC
    `;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messageCount: Number(r.messageCount) || 0,
    }));
  }),

  // =================================================================
  // 6. getChatSession — get a specific session with messages
  // =================================================================
  getChatSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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
});
