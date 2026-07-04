// =========================================
// AI syllabus scanner — image/PDF → dated items
// =========================================
// Extraction only: exam sittings + assignment deadlines the syllabus states.
// Nothing is written here — the student approves each row in the UI and tasks
// are created through the existing studyTask.create mutation (demo-guarded).
// We NEVER write scanned data to the shared course catalog.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { generateGeminiVision } from "@/lib/ai/gemini-client";
import { detectProvider } from "@/lib/ai/provider";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";
import { parseSyllabus, SYLLABUS_SYSTEM } from "@/lib/syllabus-scan";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const scanInputSchema = z.object({
  imageBase64: z.string().min(100).max(5_000_000),
  mimeType: z.string().refine((m) => ALLOWED_MIME.has(m), "Unsupported file type"),
});

export async function POST(request: NextRequest) {
  const locale = request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "he";
  const errs =
    locale === "en"
      ? {
          noKey: "Scanning needs a Gemini key — add a free one in settings, or try again later when the shared key is available.",
          unreadable: "Couldn't find dated items — try a sharper photo of the syllabus schedule section.",
          rateLimit: "Scan limit reached for now — try again later.",
          badKey: "The Gemini key was rejected — check the key in settings (or remove it to use the shared key).",
          unavailable: "The scanner is temporarily unavailable — please try again later.",
        }
      : {
          noKey: "הסריקה צריכה מפתח Gemini — הוסיפו מפתח חינמי בהגדרות, או נסו שוב מאוחר יותר כשהמפתח המשותף פנוי.",
          unreadable: "לא נמצאו תאריכים בסילבוס — נסו צילום חד יותר של קטע לוח-הזמנים.",
          rateLimit: "הגעתם למגבלת הסריקות לעכשיו — נסו שוב מאוחר יותר.",
          badKey: "מפתח ה-Gemini נדחה — בדקו את המפתח בהגדרות (או הסירו אותו כדי להשתמש במפתח המשותף).",
          unavailable: "הסורק אינו זמין כרגע — נסו שוב מאוחר יותר.",
        };

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isDemoEmail(authUser.email)) {
      return NextResponse.json({ error: DEMO_READONLY_MESSAGE }, { status: 403 });
    }

    const parsed = scanInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { supabaseId: authUser.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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

    // Per-user daily quota AFTER auth/validation/key-resolution — a failed
    // attempt (bad input, no key) must not burn a daily scan. (verification 4.7)
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
      SYLLABUS_SYSTEM,
      locale === "en"
        ? "Extract the dated items (exams, assignment deadlines) from this syllabus."
        : "חלץ את הפריטים המתוארכים (בחינות, הגשות) מהסילבוס הזה.",
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );

    const extraction = parseSyllabus(text);
    if (!extraction || extraction.items.length === 0) {
      return NextResponse.json({ error: errs.unreadable }, { status: 422 });
    }

    return NextResponse.json(extraction);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json({ error: errs.rateLimit }, { status: 429 });
    }
    if (status === 400 || status === 401 || status === 403) {
      return NextResponse.json({ error: errs.badKey }, { status: 400 });
    }
    if (status === 404) {
      console.error("[scan-syllabus] provider 404 (model retired?):", e);
      return NextResponse.json({ error: errs.unavailable }, { status: 503 });
    }
    console.error("[scan-syllabus] failed:", e);
    return NextResponse.json({ error: errs.unreadable }, { status: 500 });
  }
}
