// =========================================
// M2 — Form 3010 scanner: image/PDF → extracted service periods
// =========================================
// EXTRACTION ONLY — nothing is written anywhere. The client shows the
// per-semester suggestion and the student approves each semester explicitly
// through the existing user.upsertMiluimSemester mutation (ownership + demo
// guards live there). Mirrors scan-grades' auth/key/limit hardening.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { generateGeminiVision } from "@/lib/ai/gemini-client";
import { detectProvider } from "@/lib/ai/provider";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";
import { parseForm3010, summarizeForm3010, FORM_3010_SYSTEM } from "@/lib/form-3010";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

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
          unreadable: "Couldn't read the form — try a sharper, straighter photo of the periods table.",
          rateLimit: "Scan limit reached for now — try again later.",
          badKey: "The Gemini key was rejected — check the key in settings (or remove it to use the shared key).",
          unavailable: "The scanner is temporarily unavailable — please try again later.",
        }
      : {
          noKey: "הסריקה צריכה מפתח Gemini — הוסיפו מפתח חינמי בהגדרות, או נסו שוב מאוחר יותר כשהמפתח המשותף פנוי.",
          unreadable: "לא הצלחנו לקרוא את הטופס — נסו צילום חד וישר יותר של טבלת התקופות.",
          rateLimit: "הגעתם למגבלת הסריקות לעכשיו — נסו שוב מאוחר יותר.",
          badKey: "מפתח ה-Gemini נדחה — בדקו את המפתח בהגדרות (או הסירו אותו כדי להשתמש במפתח המשותף).",
          unavailable: "הסורק אינו זמין כרגע — נסו שוב מאוחר יותר.",
        };

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Demo is read-only AND must not drain the shared vision quota.
    if (isDemoEmail(authUser.email)) {
      return NextResponse.json({ error: DEMO_READONLY_MESSAGE }, { status: 403 });
    }

    const parsed = scanInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { supabaseId: authUser.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Key resolution — the student's own Gemini key, else the shared free key.
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
    if (!encryptedKey) return NextResponse.json({ error: errs.noKey }, { status: 412 });

    // Quota AFTER auth/validation/key — a failed attempt never burns a scan.
    // Shares the daily scan bucket with the grade sheet (same vision budget).
    const perUser = checkRateLimit(`scan-day:${authUser.id}`, { maxRequests: 10, windowSeconds: 86_400 });
    if (!perUser.allowed) {
      return NextResponse.json({ error: errs.rateLimit }, { status: 429, headers: { "Retry-After": String(perUser.resetInSeconds) } });
    }
    if (usingSharedKey) {
      const global = checkRateLimit("scan-day:__global__", { maxRequests: 150, windowSeconds: 86_400 });
      if (!global.allowed) {
        return NextResponse.json({ error: errs.rateLimit }, { status: 429, headers: { "Retry-After": String(global.resetInSeconds) } });
      }
    }

    const text = await generateGeminiVision(
      encryptedKey,
      FORM_3010_SYSTEM,
      locale === "en" ? "Extract the service periods from this Form 3010." : "חלץ את תקופות השירות מטופס 3010 הזה.",
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );

    const form = parseForm3010(text);
    if (!form || form.periods.length === 0) {
      return NextResponse.json({ error: errs.unreadable }, { status: 422 });
    }

    return NextResponse.json({ form, summary: summarizeForm3010(form) });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 429) return NextResponse.json({ error: errs.rateLimit }, { status: 429 });
    if (status === 400 || status === 401 || status === 403) {
      return NextResponse.json({ error: errs.badKey }, { status: 400 });
    }
    if (status === 404) {
      console.error("[scan-3010] provider 404 (model retired?):", e);
      return NextResponse.json({ error: errs.unavailable }, { status: 503 });
    }
    console.error("[scan-3010] failed:", e);
    return NextResponse.json({ error: errs.unreadable }, { status: 500 });
  }
}
