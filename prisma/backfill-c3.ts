// =========================================
// C3 Backfill Script
// Creates University (TAU), Program (PPE), and links existing records.
// Run after migration: npx tsx prisma/backfill-c3.ts
// =========================================

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { TAU_PPE_2025 } from "../src/lib/programs/definitions/tau-ppe-2025";

// Load .env.local (same approach as prisma.config.ts)
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx);
        const val = trimmed.substring(eqIdx + 1);
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🏛️  C3 Backfill: Creating University + Program records...\n");

  // Step 1: Upsert TAU University
  const university = await prisma.university.upsert({
    where: { code: "tau" },
    update: {},
    create: {
      code: "tau",
      nameHe: "אוניברסיטת תל אביב",
      nameEn: "Tel Aviv University",
      yedionUrl: "https://ims.tau.ac.il/tal",
    },
  });
  console.log(`✅ University: ${university.nameHe} (${university.id})`);

  // Step 2: Upsert PPE Program
  const program = await prisma.program.upsert({
    where: {
      universityId_code_academicYear: {
        universityId: university.id,
        code: "PPE",
        academicYear: 2025,
      },
    },
    update: {
      definition: TAU_PPE_2025 as unknown as Prisma.InputJsonValue,
    },
    create: {
      code: "PPE",
      universityId: university.id,
      nameHe: 'פכ"מ — פילוסופיה, כלכלה ומדע המדינה',
      nameEn: "PPE — Philosophy, Economics & Political Science",
      academicYear: 2025,
      definition: TAU_PPE_2025 as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`✅ Program: ${program.nameHe} (${program.id})`);

  // Step 3: Link all existing users to this program (if not already linked)
  const usersUpdated = await prisma.user.updateMany({
    where: { programId: null },
    data: { programId: program.id },
  });
  console.log(`✅ Users linked: ${usersUpdated.count} users → PPE program`);

  // Step 4: Link all existing courses to TAU (if not already linked)
  const coursesUpdated = await prisma.course.updateMany({
    where: { universityId: null },
    data: { universityId: university.id },
  });
  console.log(`✅ Courses linked: ${coursesUpdated.count} courses → TAU`);

  // Step 5: Verify
  const userCount = await prisma.user.count({ where: { programId: { not: null } } });
  const courseCount = await prisma.course.count({ where: { universityId: { not: null } } });
  console.log(`\n📊 Verification:`);
  console.log(`   Users with program: ${userCount}`);
  console.log(`   Courses with university: ${courseCount}`);
  console.log(`\n🎓 C3 Backfill complete!`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Backfill error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
