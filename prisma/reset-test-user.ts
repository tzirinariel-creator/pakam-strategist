/**
 * Reset a TEST user — delete a user (and ALL their data, via onDelete: Cascade)
 * by email, so the next login starts onboarding from scratch. Every User relation
 * (userCourses, miluimSemesters, plan, calendar, chat, tasks, syllabi...) cascades,
 * so deleting the row wipes everything that user owns — and nothing else.
 *
 * After it runs: just log in again (e.g. with Google). enforceAuth creates a fresh
 * row for your auth id, so you land in the onboarding flow from zero. You do NOT
 * need to re-do Google auth — the Supabase auth account is untouched.
 *
 * SAFETY: requires the email as an explicit argument; refuses the shared demo
 * account; only ever touches the one matched user.
 *
 * Usage:  npx tsx prisma/reset-test-user.ts arieltzirin@mail.tau.ac.il
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

// Load .env.local manually (standalone Prisma scripts don't auto-load it).
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const i = t.indexOf("=");
      if (i > 0 && !process.env[t.slice(0, i)]) {
        process.env[t.slice(0, i)] = t.slice(i + 1);
      }
    }
  }
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL must be set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error(
      "✗ Provide an email:  npx tsx prisma/reset-test-user.ts you@example.com",
    );
    process.exit(1);
  }
  const demo = (
    process.env.NEXT_PUBLIC_DEMO_USER_EMAIL || "demo@pakamon.dev"
  ).toLowerCase();
  if (email === demo) {
    console.error("✗ Refusing to delete the shared demo account.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`ℹ️  No user found for ${email} — already fresh, nothing to delete.`);
    return;
  }

  const courses = await prisma.userCourse.count({ where: { userId: user.id } });
  console.log(
    `🗑️  Deleting user ${email} (id ${user.id}) — ${courses} courses + all related data (cascade)…`,
  );
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`✅ Done. Log in again to start onboarding from scratch.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
