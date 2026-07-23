#!/usr/bin/env npx tsx
// =========================================================================
// Reset the TEST user to a clean, onboarding-empty slate.
// =========================================================================
// Ariel's standing request: wipe his test account at the end of each session
// so he can test the app A→Z (signup/onboarding → dashboard → …) from scratch.
//
// This mirrors the app's own `user.resetTestUser` mutation EXACTLY, so the
// script and the in-app "reset" button can never drift. It is HARD-SCOPED to
// NEXT_PUBLIC_TEST_USER_EMAIL — it refuses to run against any other account,
// and it never touches the shared demo user or any real student.
//
// Usage:  npx tsx scripts/reset-test-user.ts
// =========================================================================
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(__dirname, "..", envFile);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx);
          const val = trimmed.substring(eqIdx + 1);
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
    break;
  }
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

const testEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL?.trim();
if (!testEmail) throw new Error("NEXT_PUBLIC_TEST_USER_EMAIL not set — refusing to run");

const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL?.trim();
if (demoEmail && testEmail === demoEmail) {
  throw new Error("TEST email equals DEMO email — refusing to reset the shared demo account");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({ where: { email: testEmail } });
  if (!user) {
    console.log(`No user with email ${testEmail} — nothing to reset (already clean).`);
    return;
  }

  // Exactly the deletes from user.resetTestUser (keep in lockstep).
  await prisma.$transaction([
    prisma.studyTask.deleteMany({ where: { userId: user.id } }),
    prisma.calendarEvent.deleteMany({ where: { userId: user.id } }),
    prisma.chatSession.deleteMany({ where: { userId: user.id } }),
    prisma.studyMaterial.deleteMany({ where: { userId: user.id } }),
    prisma.synthesisNote.deleteMany({ where: { userId: user.id } }),
    prisma.syllabus.deleteMany({ where: { userId: user.id } }),
    prisma.userCourse.deleteMany({ where: { userId: user.id } }),
  ]);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: null,
      focusArea: null,
      currentYear: 1,
      currentSemester: "FALL",
      startYear: null,
      miluimGroup: "NONE",
      miluimCreditsUsed: 0,
      miluimBinaryUsed: 0,
      amiramScore: null,
      englishLevel: null,
    },
  });

  await prisma.miluimSemester.deleteMany({ where: { userId: user.id } });

  console.log(`✅ Reset test user ${testEmail} to a clean onboarding-empty slate.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
