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
  validateApiKey,
  maskApiKey,
} from "@/lib/ai/claude-client";
import {
  type StoredMessage,
} from "@/lib/ai/context-builder";

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
});
