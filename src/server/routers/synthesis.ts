// =========================================
// Synthesis Lab — tRPC Router
// =========================================
// CRUD for synthesis notes + AI-powered
// cross-discipline connection suggestions.

import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import { createClaudeClient, CLAUDE_MODEL, MAX_TOKENS } from "@/lib/ai/claude-client";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { getAllDisciplineIds, getProgramById } from "@/lib/programs/registry";
import { checkRateLimit } from "@/lib/rate-limit";

// -------------------------------------------------------------------
// Shared schema helpers
// -------------------------------------------------------------------

// Discipline enum covering ALL registered programs (PPE, Law, etc.)
const disciplineEnum = z.enum(getAllDisciplineIds());

// -------------------------------------------------------------------
// Router
// -------------------------------------------------------------------

export const synthesisRouter = createTRPCRouter({
  /**
   * List all synthesis notes for the current user.
   * Returns compact objects (content is trimmed to 150 chars).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const notes = await ctx.db.synthesisNote.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      disciplines: note.disciplines,
      courseConnections: note.courseConnections,
      tags: note.tags,
      aiGenerated: note.aiGenerated,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      contentPreview: note.content.slice(0, 150),
    }));
  }),

  /**
   * Get a single synthesis note with full content.
   */
  get: protectedProcedure
    .input(z.object({ noteId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const note = await ctx.db.synthesisNote.findFirst({
        where: { id: input.noteId, userId: user.id },
      });

      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      return note;
    }),

  /**
   * Create a new synthesis note.
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(50_000),
        disciplines: z.array(disciplineEnum).min(1),
        courseConnections: z.array(z.string()),
        tags: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const note = await ctx.db.synthesisNote.create({
        data: {
          userId: user.id,
          title: input.title,
          content: input.content,
          disciplines: input.disciplines,
          courseConnections: input.courseConnections,
          tags: input.tags,
          aiGenerated: false,
        },
      });

      return note;
    }),

  /**
   * Update an existing synthesis note.
   */
  update: protectedProcedure
    .input(
      z.object({
        noteId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().min(1).optional(),
        disciplines: z.array(disciplineEnum).min(1).optional(),
        courseConnections: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Verify ownership
      const existing = await ctx.db.synthesisNote.findFirst({
        where: { id: input.noteId, userId: user.id },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      const { noteId, ...updateData } = input;

      const updated = await ctx.db.synthesisNote.update({
        where: { id: noteId },
        data: updateData,
      });

      return updated;
    }),

  /**
   * Delete a synthesis note.
   */
  delete: protectedProcedure
    .input(z.object({ noteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Verify ownership
      const existing = await ctx.db.synthesisNote.findFirst({
        where: { id: input.noteId, userId: user.id },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      await ctx.db.synthesisNote.delete({
        where: { id: input.noteId },
      });

      return { success: true };
    }),

  /**
   * AI-powered synthesis suggestion.
   * Selects 2-3 disciplines, queries Claude for cross-discipline connections.
   */
  generateSuggestion: protectedProcedure
    .input(
      z.object({
        disciplines: z
          .array(disciplineEnum)
          .min(2)
          .max(3),
        prompt: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { supabaseId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Require an API key
      if (!user.encryptedClaudeKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Claude API key is required. Please add it in Settings.",
        });
      }

      // Fetch user's courses in the selected disciplines
      const userCourses = await ctx.db.userCourse.findMany({
        where: { userId: user.id },
        include: { course: true },
      });

      const relevantCourses = userCourses
        .filter((uc) =>
          input.disciplines.includes(uc.course.discipline)
        )
        .map((uc) => `${uc.course.code} - ${uc.course.nameHe}`);

      // Build discipline names for the prompt
      const disciplineNames = input.disciplines
        .map((d) => {
          const cfg = DISCIPLINE_CONFIG[d];
          return cfg ? `${cfg.nameHe} (${cfg.nameEn})` : d;
        })
        .join(", ");

      const courseContext =
        relevantCourses.length > 0
          ? `\n\nהקורסים של הסטודנט בדיסציפלינות אלו:\n${relevantCourses.join("\n")}`
          : "\n\nלסטודנט אין עדיין קורסים בדיסציפלינות אלו.";

      const userPrompt = input.prompt
        ? `\n\nשאלה/נושא ספציפי מהסטודנט: ${input.prompt}`
        : "";

      const prog = getProgramById(user.programId);
      const systemPrompt = `אתה יועץ אקדמי בתוכנית ${prog.nameHe} (${prog.fullNameHe}) ב${prog.university.nameHe}.
תפקידך לזהות ולהציע חיבורים בין-דיסציפלינריים מעניינים ומשמעותיים בין הדיסציפלינות שנבחרו.
הצע חיבור אחד מעמיק שמשלב רעיונות, תיאוריות או סוגיות מהתחומים הנבחרים.
ענה בעברית.

החזר את התשובה בדיוק בפורמט JSON הבא (ללא markdown או טקסט נוסף):
{"title": "כותרת החיבור", "content": "תוכן מפורט של החיבור הבין-דיסציפלינרי (3-5 פסקאות)", "suggestedTags": ["תגית1", "תגית2", "תגית3"]}`;

      const messageContent = `הצע חיבור בין-דיסציפלינרי בין הדיסציפלינות: ${disciplineNames}${courseContext}${userPrompt}`;

      // Rate limit: 20 AI suggestions per minute per user (these call Claude + write the DB).
      const rateLimit = checkRateLimit(`ai-synth:${ctx.userId}`, {
        maxRequests: 20,
        windowSeconds: 60,
      });
      if (!rateLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please wait a moment.",
        });
      }

      // Create client and call Claude (guard key decrypt/validation, like the other AI routes).
      let claude;
      try {
        claude = createClaudeClient(user.encryptedClaudeKey);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Failed to initialize Claude client. Your API key may be invalid — please re-enter it in Settings.",
        });
      }

      let response;
      try {
        response = await claude.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: messageContent }],
        });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Invalid Claude API key" });
        }
        if (status === 429) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please wait." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI service unavailable" });
      }

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No text response from Claude",
        });
      }

      // Parse the JSON response (strip markdown fences the model sometimes adds).
      try {
        const cleaned = textBlock.text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned) as {
          title: string;
          content: string;
          suggestedTags: string[];
        };

        return {
          title: parsed.title,
          content: parsed.content,
          suggestedTags: parsed.suggestedTags,
        };
      } catch {
        // If JSON parsing fails, treat the whole response as content
        return {
          title: "חיבור בין-דיסציפלינרי",
          content: textBlock.text,
          suggestedTags: input.disciplines.map(
            (d) => DISCIPLINE_CONFIG[d]?.nameHe ?? d
          ),
        };
      }
    }),
});
