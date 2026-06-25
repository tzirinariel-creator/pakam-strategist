#!/usr/bin/env npx tsx
// Add 0651-3007 PPE Seminar B to DB
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
  const existing = await prisma.course.findUnique({ where: { code: "0651-3007" } });
  if (existing) {
    console.log("0651-3007 already exists, skipping");
    return;
  }

  await prisma.course.create({
    data: {
      code: "0651-3007",
      nameHe: 'סמינר פכ"מ ב\'',
      nameEn: "PPE Seminar B",
      credits: 4,
      discipline: "PPE_CORE",
      courseType: "SEMINAR",
      semesterOffered: ["SPRING"],
      yearOffered: [3],
      isMandatory: false,
      prerequisites: ["0651-1001", "0651-1002"],
      canCountAs: [],
      isActive: true,
      description: 'סמינר אינטגרטיבי שני בתוכנית פכ"מ. גישה בין-תחומית לסוגיות עכשוויות בפילוסופיה, כלכלה ומדע המדינה.',
    },
  });
  console.log('Added 0651-3007 (PPE Seminar B)');

  const count = await prisma.course.count();
  console.log("Total courses in DB:", count);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
