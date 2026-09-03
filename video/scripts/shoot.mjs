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
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.SHOOT_BASE ?? "https://pakam-strategist.vercel.app";
// fileURLToPath ולא URL.pathname — הנתיב של הפרויקט מכיל עברית ורווחים,
// ו-.pathname מחזיר אותו מקודד־אחוזים, מה שיוצר תיקייה בשם משובש.
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "shots");

/**
 * מה למדוד בכל מסך. הסקיל דורש `layout.json` עם קואורדינטות ברמת אלמנט
 * (Q1) — בלעדיו אי אפשר לבנות גיבור יחיד, כי אין לדעת איפה הוא על הפריים.
 * הסלקטורים מכוונים לכרטיסים אמיתיים, לא ל-div שרירותי.
 */
const MEASURE = {
  planner: '[data-course-card], [class*="rounded-xl"][class*="border"]',
  dashboard: '[class*="rounded-xl"][class*="border"], [class*="rounded-2xl"]',
  catalog: "tbody tr",
  graduation: '[class*="rounded-xl"][class*="border"]',
};

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
const layout = {};

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

    // רצועת "מצב דמו" היא כרומה, לא מוצר. חותכים אותה כאן ולא ב-CSS של
    // הסרטון: קיזוז גיאומטרי בצד הרנדר גורר objectFit שחותך את הצדדים,
    // וזה בדיוק מה שקרה בגרסה הקודמת — הסיידבר נעלם מהפריים.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("div")) {
        if (!el.textContent?.includes("מצב דמו")) continue;
        const sticky = el.closest('[class*="sticky"]');
        if (sticky instanceof HTMLElement) {
          sticky.style.display = "none";
          break;
        }
      }
      // גם ה-FAB של המלך — הוא צף מעל הפינה ומכסה תוכן בכל צילום.
      const fab = document.querySelector('[data-tour="floating-assistant"], .pk-fab');
      if (fab instanceof HTMLElement) fab.style.visibility = "hidden";
    });
    await page.waitForTimeout(300);
    const url = page.url();
    if (s.auth && /\/login/.test(url)) {
      console.log(`  ⚠️  הופנה להתחברות — מדלג`);
      continue;
    }
    await page.screenshot({
      path: join(OUT, `${s.name}.png`),
      fullPage: Boolean(s.full),
    });
    // קואורדינטות האלמנטים — בפיקסלים של הפריים (1920×1080), לא של הטקסטורה
    const sel = MEASURE[s.name];
    if (sel) {
      const boxes = await page.evaluate((q) => {
        const seen = [];
        for (const el of document.querySelectorAll(q)) {
          const r = el.getBoundingClientRect();
          if (r.width < 120 || r.height < 40) continue;
          if (r.top < 0 || r.bottom > window.innerHeight) continue;
          seen.push({
            x: Math.round(r.left), y: Math.round(r.top),
            w: Math.round(r.width), h: Math.round(r.height),
            text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 46),
          });
        }
        // הגדולים והמרכזיים קודם — מועמד־גיבור סביר יותר
        return seen.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 24);
      }, sel);
      layout[s.name] = { pageW: 1920, pageH: 1080, boxes };
      console.log(`  ✓ ${s.name}.png  (${boxes.length} תיבות)`);
    } else {
      console.log(`  ✓ ${s.name}.png`);
    }
  } catch (err) {
    console.log(`  ✗ ${s.name}: ${err.message.split("\n")[0]}`);
  }
}

writeFileSync(join(OUT, "layout.json"), JSON.stringify(layout, null, 1));
console.log(`\nlayout.json — ${Object.keys(layout).length} מסכים נמדדו`);

await browser.close();
console.log("סיום.");
