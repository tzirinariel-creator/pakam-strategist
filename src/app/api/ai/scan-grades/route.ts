// =========================================
// AI grade-sheet scanner — image → extracted rows
// =========================================
// The student uploads a photo/PDF of their TAU grade sheet; Gemini vision
// reads it and returns structured rows. This route only EXTRACTS — nothing is
// written anywhere. Applying a grade is a separate, explicit per-row action in
// the UI through plan.updateCourse (ownership + demo guards there).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { generateGeminiVision } from "@/lib/ai/gemini-client";
import { detectProvider } from "@/lib/ai/provider";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";
import { parseExtraction, GRADE_SHEET_SYSTEM } from "@/lib/grade-sheet";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const scanInputSchema = z.object({
  // ~4MB of base64 — matches serverless body limits; the client compresses.
  imageBase64: z.string().min(100).max(5_000_000),
  mimeType: z.string().refine((m) => ALLOWED_MIME.has(m), "Unsupported file type"),
});

export async function POST(request: NextRequest) {
  const locale = request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "he";
  const errs =
    locale === "en"
      ? {
          noKey: "Scanning needs a Gemini key — add a free one in settings, or try again later when the shared key is available.",
          unreadable: "Couldn't read the sheet — try a sharper, straighter photo of the grades table.",
          rateLimit: "Scan limit reached for now — try again later.",
        }
      : {
          noKey: "הסריקה צריכה מפתח Gemini — הוסיפו מפתח חינמי בהגדרות, או נסו שוב מאוחר יותר כשהמפתח המשותף פנוי.",
          unreadable: "לא הצלחנו לקרוא את הגיליון — נסו צילום חד וישר יותר של טבלת הציונים.",
          rateLimit: "הגעתם למגבלת הסריקות לעכשיו — נסו שוב מאוחר יותר.",
        };

  try {
    // Auth — verified against the auth server, like every AI route.
    const supabase = await createServerSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Demo is read-only AND must not drain the shared vision quota.
    if (isDemoEmail(authUser.email)) {
      return NextResponse.json({ error: DEMO_READONLY_MESSAGE }, { status: 403 });
    }

    // Vision calls are heavier than chat: 10 scans/day per user.
    const perUser = checkRateLimit(`scan-day:${authUser.id}`, {
      maxRequests: 10,
      windowSeconds: 86_400,
    });
    if (!perUser.allowed) {
      return NextResponse.json(
        { error: errs.rateLimit },
        { status: 429, headers: { "Retry-After": String(perUser.resetInSeconds) } },
      );
    }

    const parsed = scanInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { supabaseId: authUser.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Key resolution: the student's own key IF it's a Gemini key (vision needs
    // Gemini), else the shared free key, else a clear 412.
    let encryptedKey: string | null = null;
    let usingSharedKey = false;
    if (user.encryptedClaudeKey) {
      try {
        if (detectProvider(decrypt(user.encryptedClaudeKey)) === "gemini") {
          encryptedKey = user.encryptedClaudeKey;
        }
      } catch {
        /* fall through to shared */
      }
    }
    if (!encryptedKey && process.env.GEMINI_SHARED_KEY) {
      usingSharedKey = true;
      encryptedKey = encrypt(process.env.GEMINI_SHARED_KEY);
    }
    if (!encryptedKey) {
      return NextResponse.json({ error: errs.noKey }, { status: 412 });
    }

    if (usingSharedKey) {
      const global = checkRateLimit("scan-day:__global__", {
        maxRequests: 150,
        windowSeconds: 86_400,
      });
      if (!global.allowed) {
        return NextResponse.json(
          { error: errs.rateLimit },
          { status: 429, headers: { "Retry-After": String(global.resetInSeconds) } },
        );
      }
    }

    const text = await generateGeminiVision(
      encryptedKey,
      GRADE_SHEET_SYSTEM,
      locale === "en"
        ? "Extract the grade rows from this grade sheet."
        : "חלץ את שורות הציונים מגיליון הציונים הזה.",
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );

    const rows = parseExtraction(text);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: errs.unreadable }, { status: 422 });
    }

    return NextResponse.json({ rows });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json({ error: errs.rateLimit }, { status: 429 });
    }
    console.error("[scan-grades] failed:", e);
    return NextResponse.json({ error: errs.unreadable }, { status: 500 });
  }
}
