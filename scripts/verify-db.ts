#!/usr/bin/env npx tsx
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
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Law courses check
  const lawCourses = await prisma.course.findMany({
    where: { code: { startsWith: "1411" } },
    select: { code: true, nameHe: true, averageGrade: true, difficultyLevel: true },
  });
  console.log("Law courses (1411-*):");
  for (const c of lawCourses.sort((a, b) => a.code.localeCompare(b.code))) {
    console.log(
      `  ${c.code}  ${(c.nameHe ?? "").padEnd(30)} avg:${String(c.averageGrade ?? "?").padEnd(6)} ${c.difficultyLevel ?? "?"}`
    );
  }

  // LAW-* placeholder check
  const placeholders = await prisma.course.findMany({
    where: { code: { startsWith: "LAW" } },
  });
  console.log(`\nLAW-* placeholders remaining: ${placeholders.length}`);
  for (const c of placeholders) {
    console.log(`  ${c.code} — ${c.nameHe}`);
  }

  // Overall stats
  const total = await prisma.course.count();
  const withGrades = await prisma.course.count({
    where: { averageGrade: { not: null } },
  });
  console.log(`\nTotal courses: ${total}`);
  console.log(`With grade data: ${withGrades} (${Math.round((withGrades / total) * 100)}%)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
