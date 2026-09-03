// =========================================
// Ops health probe (OPS2 companion) — no auth, no secrets.
// =========================================
// Reports PRESENCE booleans only: is the DB reachable, is a shared Gemini
// key configured, which model. Exists because sensitive Vercel env vars
// can't be read from outside — the server itself is the only witness.
// Never returns values, user data, or anything an attacker can use beyond
// what the marketing site already implies.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GEMINI_MODEL, GEMINI_MODELS } from "@/lib/ai/gemini-client";

export const dynamic = "force-dynamic";

// =========================================
// בדיקת חיות אמיתית של הספק — 3.9
// =========================================
// הבדיקה הזאת דיווחה `sharedAiKey: true` ואת **שם** המודל, ולא קראה לספק
// אף פעם. כלומר מודל שגוגל הוציאה משירות נראה כאן בריא לגמרי.
//
// זה בדיוק איך שזה נתגלה: אריאל העלה טופס 3010 בזרימת ההרשמה וקיבל
// "הסורק אינו זמין כרגע". 503 פירושו שכל המודלים ברשימה ענו 404 — ולא רק
// הסורק היה מושבת, גם המלך. שום התראה לא קמה, כי הבדיקה שאמורה לתפוס את
// זה שאלה שאלה אחרת.
//
// עכשיו היא באמת שולחת בקשה זעירה. התוצאה נשמרת בזיכרון לחמש דקות כדי
// שניטור שדוגם כל דקה לא ישרוף את המכסה החינמית, ו-`?deep=0` מדלג לגמרי.
type AiProbe = { alive: boolean; model: string | null; status: number | null; at: number };
let cachedProbe: AiProbe | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

async function probeAi(): Promise<AiProbe> {
  const now = Date.now();
  if (cachedProbe && now - cachedProbe.at < PROBE_TTL_MS) return cachedProbe;

  const key = process.env.GEMINI_SHARED_KEY;
  if (!key) {
    cachedProbe = { alive: false, model: null, status: null, at: now };
    return cachedProbe;
  }

  // הבקשה הקטנה ביותר שעדיין מוכיחה שהמודל קיים ועונה.
  const body = JSON.stringify({
    contents: [{ parts: [{ text: "ok" }] }],
    generationConfig: { maxOutputTokens: 1, temperature: 0 },
  });

  let lastStatus: number | null = null;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body,
          signal: AbortSignal.timeout(6000),
        },
      );
      lastStatus = res.status;
      // 429 = המודל חי, המכסה נגמרה לרגע. זו לא תקלה שצריך להעיר עליה אדם.
      if (res.ok || res.status === 429) {
        cachedProbe = { alive: true, model, status: res.status, at: now };
        return cachedProbe;
      }
    } catch {
      lastStatus = null;
    }
  }
  cachedProbe = { alive: false, model: null, status: lastStatus, at: now };
  return cachedProbe;
}

export async function GET(request: Request) {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const deep = new URL(request.url).searchParams.get("deep") !== "0";
  const ai = deep ? await probeAi() : null;

  return NextResponse.json({
    // `ok` הוא מה שניטור זמינות בודק. מודל מת מוריד את המלך ואת שני
    // הסורקים, כלומר את חצי המוצר — ולכן הוא נכנס לתשובה הזאת.
    ok: dbOk && (ai == null || ai.alive),
    db: dbOk,
    sharedAiKey: Boolean(process.env.GEMINI_SHARED_KEY),
    model: GEMINI_MODEL,
    ...(ai
      ? {
          ai: {
            alive: ai.alive,
            /** המודל שענה בפועל — לא בהכרח הראשון ברשימה. */
            respondingModel: ai.model,
            lastStatus: ai.status,
            /** כל השרשרת, כדי שאפשר יהיה לראות מה נוסה. */
            chain: GEMINI_MODELS,
          },
        }
      : {}),
    time: new Date().toISOString(),
  });
}
