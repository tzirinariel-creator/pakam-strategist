/**
 * צילומי מסך אמיתיים מהאתר החי — pakam-strategist.vercel.app
 *
 * עיקרון Q1 של video-shotcraft: כשמשחזרים עמוד קיים, חובה צילום אמיתי.
 *
 * כניסה דרך /api/auth/demo-login (חשבון הדמו). **בלי `?reset=demo`** —
 * הפרמטר הזה מפעיל resetDemoUser, שהיא כתיבה. החוקה אומרת שחשבון הדמו
 * קריאה־בלבד, אז אנחנו רק מקבלים session ונכנסים ישירות למסכים.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.SHOOT_BASE ?? "https://pakam-strategist.vercel.app";
// fileURLToPath ולא URL.pathname — הנתיב של הפרויקט מכיל עברית ורווחים,
// ו-.pathname מחזיר אותו מקודד־אחוזים, מה שיוצר תיקייה בשם משובש.
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "shots");

const SCREENS = [
  { name: "landing", path: "/he", auth: false, full: true },
  { name: "dashboard", path: "/he/dashboard", auth: true },
  { name: "planner", path: "/he/planner", auth: true },
  { name: "calendar", path: "/he/calendar", auth: true },
  { name: "catalog", path: "/he/catalog", auth: true },
  { name: "graduation", path: "/he/graduation", auth: true },
  { name: "regulations", path: "/he/regulations", auth: true },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2, // נתונים דו־ממדיים ב-3D צריכים טקסטורה בגודל כפול
  locale: "he-IL",
  timezoneId: "Asia/Jerusalem",
  colorScheme: "light",
});
const page = await ctx.newPage();

// כניסה לחשבון הדמו
console.log("מתחבר לחשבון הדמו…");
await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
const res = await page.request.post(`${BASE}/api/auth/demo-login`);
console.log(`  demo-login → ${res.status()}`);
if (!res.ok()) {
  console.error("  הכניסה נכשלה. מצלם רק את העמודים הציבוריים.");
}

for (const s of SCREENS) {
  try {
    console.log(`מצלם ${s.name} …`);
    await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 45000 });
    // לתת לאנימציות הכניסה (stagger 0.4s) ולשאילתות tRPC להיסגר
    await page.waitForTimeout(3500);
    const url = page.url();
    if (s.auth && /\/login/.test(url)) {
      console.log(`  ⚠️  הופנה להתחברות — מדלג`);
      continue;
    }
    await page.screenshot({
      path: join(OUT, `${s.name}.png`),
      fullPage: Boolean(s.full),
    });
    console.log(`  ✓ ${s.name}.png`);
  } catch (err) {
    console.log(`  ✗ ${s.name}: ${err.message.split("\n")[0]}`);
  }
}

await browser.close();
console.log("\nסיום.");
