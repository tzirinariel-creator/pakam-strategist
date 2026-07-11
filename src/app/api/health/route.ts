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
import { GEMINI_MODEL } from "@/lib/ai/gemini-client";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ok: dbOk,
    db: dbOk,
    sharedAiKey: Boolean(process.env.GEMINI_SHARED_KEY),
    model: GEMINI_MODEL,
    time: new Date().toISOString(),
  });
}
