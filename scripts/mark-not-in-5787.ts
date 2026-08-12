#!/usr/bin/env npx tsx
// Mark every course that vanished from the תשפ״ז yedion with an HONEST
// uncertainty note (Ariel note #3). We do NOT know why a course is missing —
// it could be cancelled, re-coded, or simply not published yet — so the text
// says exactly that instead of asserting a cause. The note is what the UI
// shows students who still have such a course in their plan.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs"; import path from "node:path";
const REPO = path.join(__dirname, "..");
for (const f of [".env.local", ".env"]) { const p = path.join(REPO, f);
  if (fs.existsSync(p)) { for (const l of fs.readFileSync(p, "utf-8").split("\n")) { const t = l.trim();
    if (t && !t.startsWith("#")) { const i = t.indexOf("="); if (i > 0) { const k = t.substring(0, i); if (!process.env[k]) process.env[k] = t.substring(i + 1); } } } break; } }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

export const NOT_IN_5787_MARK = "[לא-בידיעון-תשפז]";

async function main() {
  const apply = process.argv.includes("--apply");
  const stale = await prisma.course.findMany({
    where: { isActive: false },
    select: { code: true, nameHe: true, courseType: true, description: true },
  });
  // Synthetic placeholder rows and user-typed free-text courses are NOT
  // "missing from the yedion" — they were never in it. Skip them.
  const real = stale.filter((c) => /^\d{4}-\d{4}$/.test(c.code));
  console.log(`deactivated: ${stale.length} | real yedion-style codes: ${real.length}`);
  if (!apply) { console.log("DRY RUN — pass --apply to write"); return; }
  let n = 0;
  for (const c of real) {
    const note = `${NOT_IN_5787_MARK} הקורס לא מופיע בידיעון תשפ״ז. ייתכן שהוא בוטל, שקודו שונה, או שטרם פורסם — לא ידוע לנו מה מבין השלושה. מומלץ לאמת מול מזכירות התכנית לפני שמסתמכים עליו.`;
    await prisma.course.update({ where: { code: c.code }, data: { description: note } });
    n++;
  }
  console.log(`marked ${n} courses with the honest uncertainty note.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
