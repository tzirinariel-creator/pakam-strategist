#!/usr/bin/env npx tsx
// "מחקר עומק על השושלת" (note 22-16, still open).
//
// The screen is live. The question nobody has asked is whether it can SAY
// anything at the scale we actually have. Every number on it is behind a
// k-anonymity floor, and with ~24 users most floors may simply never be
// reached — in which case the feature is a promise the product cannot keep,
// and a student who contributes gets nothing back.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const [users, reviews, gradePoints, insights] = await Promise.all([
    prisma.user.count(),
    prisma.courseReview.count(),
    prisma.courseGradePoint.count(),
    prisma.courseReview.count({ where: { NOT: { tip: null } } }).catch(() => 0),
  ]);
  console.log(`משתמשים: ${users}`);
  console.log(`חוות דעת: ${reviews} · נקודות ציון: ${gradePoints} · טיפים: ${insights}\n`);

  // How many DISTINCT courses clear each floor?
  const byCourseReviews = await prisma.courseReview.groupBy({
    by: ["courseCode"],
    _count: { _all: true },
  });
  const byCourseGrades = await prisma.courseGradePoint.groupBy({
    by: ["courseCode"],
    _count: { _all: true },
  });

  const clears = (rows: { _count: { _all: number } }[], n: number) =>
    rows.filter((r) => r._count._all >= n).length;

  console.log("כמה קורסים חוצים כל רף אנונימיות:");
  console.log(`   דירוג   (RATING_MIN_N = 3):   ${clears(byCourseReviews, 3)} מתוך ${byCourseReviews.length} קורסים עם חוות דעת`);
  console.log(`   טיפים   (TIP_MIN_N = 3):      ${clears(byCourseReviews, 3)}`);
  console.log(`   ציונים  (GRADE_MIN_N = 5):    ${clears(byCourseGrades, 5)} מתוך ${byCourseGrades.length} קורסים עם ציונים`);
  console.log(`   חציון   (QUANTILE_MIN_N = 10): ${clears(byCourseGrades, 10)}`);

  const top = [...byCourseGrades].sort((a, b) => b._count._all - a._count._all).slice(0, 5);
  if (top.length) {
    console.log("\nהקורסים עם הכי הרבה ציונים:");
    for (const t of top) {
      const c = await prisma.course.findUnique({ where: { code: t.courseCode }, select: { nameHe: true } });
      console.log(`   ${String(t._count._all).padStart(3)}  ${c?.nameHe ?? t.courseCode}`);
    }
  }

  console.log("\n— מה זה אומר —");
  const anyGrades = clears(byCourseGrades, 5);
  const anyMedian = clears(byCourseGrades, 10);
  if (anyGrades === 0)
    console.log("אף קורס לא חוצה את רף הציונים. מסך השושלת לא יכול להראות ציון מחזור לאף קורס.");
  if (anyMedian === 0)
    console.log('אף קורס לא חוצה את רף החציון. "דירוג/חציון מול המחזור" לא ניתן לבנייה כרגע —');
  console.log(`צריך ${10} תורמים לאותו קורס, ויש לנו ${users} משתמשים בסך הכול.`);
  await prisma.$disconnect();
}
void main();
