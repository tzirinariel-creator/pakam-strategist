// בדיקה מקדימה של transaction mode (6543 + pgbouncer=true) — קריאה בלבד.
// המטרה: להוכיח שהתיקון עובד עם השאילתות האמיתיות של האפליקציה, לפני
// שאריאל נוגע במשתנה הסביבה בפרודקשן.
import fs from "node:fs";
import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const raw = (process.env.DATABASE_URL || "").replace(/^"|"$/g, "");
  const u = new URL(raw);
  console.log(`מארח: ${u.hostname} · פורט נוכחי: ${u.port}`);
  u.port = "6543";
  u.searchParams.set("pgbouncer", "true");
  console.log(`נבדק: פורט ${u.port} עם pgbouncer=true\n`);

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: u.toString(), max: 2, connectionTimeoutMillis: 15_000 }),
  });

  const t0 = Date.now();
  // בדיוק סוגי השאילתות שהאפליקציה מריצה במסכים הכבדים
  const courses = await client.course.count();
  const one = await client.course.findFirst({ select: { code: true, nameHe: true } });
  const users = await client.user.count();
  const grouped = await client.course.groupBy({ by: ["discipline"], _count: { _all: true }, orderBy: { discipline: "asc" } });
  console.log(`✅ count(course) = ${courses}`);
  console.log(`✅ findFirst = ${one?.code} ${one?.nameHe?.slice(0, 30)}`);
  console.log(`✅ count(user) = ${users}`);
  console.log(`✅ groupBy החזיר ${grouped.length} קבוצות`);

  // טרנזקציה אינטראקטיבית — הנקודה הרגישה ביותר ב-transaction mode
  const tx = await client.$transaction(async (t) => {
    const a = await t.course.count();
    const b = await t.user.count();
    return a + b;
  });
  console.log(`✅ $transaction אינטראקטיבית עברה (סכום ${tx})`);

  // שאילתות מקבילות — מה שקורה בבקשת tRPC אחת עם כמה queries
  const par = await Promise.all([client.course.count(), client.user.count(), client.course.findMany({ take: 5, select: { code: true } })]);
  console.log(`✅ שלוש שאילתות במקביל: ${par[0]} · ${par[1]} · ${(par[2] as { code: string }[]).length} שורות`);

  console.log(`\nזמן כולל: ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
  await client.$disconnect();
}
main().catch((e) => { console.log("❌ נכשל:", String(e).split("\n").slice(0, 6).join("\n")); process.exit(1); });
