// ============================================================
// רצף הבדיקות המסכם (שלב 5 · G5)
// ------------------------------------------------------------
// כל מסך × שני רוחבים × שתי ערכות. מודד את מה שהעין לא תופסת —
// גלישה אופקית, טקסט חתוך, יעדי מגע, ושגיאות JS — ומצלם הכול.
//
//   node video/final-sweep.mjs [--mobile] [--dark]
// ============================================================
import { openApp, login, shot, measure, BASE } from "./tour-lib.mjs";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MOBILE = process.argv.includes("--mobile");
const DARK = process.argv.includes("--dark");
const KEY = `${MOBILE ? "נייד" : "דסקטופ"}-${DARK ? "כהה" : "בהיר"}`;
const OUT = fileURLToPath(new URL("../docs/רצף-מסכם.json", import.meta.url));

const PAGES = [
  ["/he/dashboard", "בית"], ["/he/planner", "תכנון התואר"],
  ["/he/planner/semester", "מתכנן הסמסטר"], ["/he/bidding", "בידינג"],
  ["/he/regulations", "דרישות התואר"], ["/he/record", "התיק האקדמי"],
  ["/he/graduation", "מחשבון ציון גמר"], ["/he/exam-planner", "תכנון מבחנים"],
  ["/he/exam", "לוח בחינות"], ["/he/calendar", "יומן"], ["/he/catalog", "קטלוג"],
  ["/he/lineage", "השושלת"], ["/he/miluim", "מילואים"], ["/he/guide", "מדריך"],
  ["/he/settings", "הגדרות"],
];

const { b, ctx: bctx, p, errors } = await openApp(
  MOBILE ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 1100 },
);
if (DARK) await p.emulateMedia({ colorScheme: "dark" });

await login(p);
await p.waitForTimeout(6000);
// **בלי ללחוץ על המתג.** `emulateMedia` לבדו מספיק: ברירת המחדל של
// האפליקציה היא `system`, ולכן העדפת המערכת קובעת — נמדד: `<html class=dark>`
// ורקע rgb(11,11,15).
// הגרסה הראשונה כאן לחצה גם על המתג "כדי לוודא", והמתג הוא מחזור
// system→light→dark שהתווית שלו מתארת את היעד הבא. כלומר הלחיצה העבירה
// את הריצה הכהה **בחזרה לבהיר**, ושתי הערכות יצאו זהות בית-בבית.
// זה בדיוק T2 בהיפוך: לא "נבדק רק בכהה" אלא "חשבתי שבדקתי כהה ובדקתי בהיר".
const themeNow = await p.evaluate(() => ({
  cls: /\bdark\b/.test(document.documentElement.className) ? "dark" : "light",
  bg: getComputedStyle(document.body).backgroundColor,
}));
console.log(`ערכה בפועל: ${themeNow.cls} · רקע ${themeNow.bg}`);
if (DARK && themeNow.cls !== "dark") {
  console.log("‼️ ביקשתי כהה והדף בהיר — עוצר, כי מדידה בערכה הלא נכונה גרועה מאי-מדידה.");
  await b.close();
  process.exit(1);
}

console.log(`\n═══ רצף מסכם · ${KEY} ═══\n`);
const rows = [];
for (const [path, name] of PAGES) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);
  await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {});
  // סוגרים חלון מודאלי שנפתח פעם למכשיר
  for (let i = 0; i < 2; i++) {
    if (!(await p.locator("[data-slot=dialog-overlay]").count())) break;
    const c = p.getByRole("button", { name: /^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/ }).first();
    if (await c.count()) await c.click().catch(() => {}); else await p.keyboard.press("Escape");
    await p.waitForTimeout(800);
  }
  const m = await measure(p);
  const txt = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const js = [...new Set(errors)]; errors.length = 0;
  const file = await shot(p, `FINAL-${KEY}-${name}`);
  const row = {
    screen: name, path, chars: txt.length,
    overflowX: m.overflowX,
    clipped: m.clipped.length, tinyTargets: m.tinyTargets.length, tinyText: m.tinyText.length,
    js: js.length, jsDetail: js.slice(0, 2),
    shot: file.split("/").pop(),
  };
  rows.push(row);
  const flags = [];
  if (row.overflowX) flags.push("⚠️ גלישה אופקית");
  if (row.clipped) flags.push(`טקסט חתוך ${row.clipped}`);
  if (row.tinyTargets) flags.push(`יעד קטן ${row.tinyTargets}`);
  if (row.tinyText) flags.push(`משפט <12px ${row.tinyText}`);
  if (row.js) flags.push(`✗ JS ${row.js}`);
  console.log(`${flags.length ? "⚠️ " : "✓ "}${name.padEnd(16)} ${String(row.chars).padStart(5)} תווים  ${flags.join(" · ")}`);
  if (row.js) for (const e of row.jsDetail) console.log(`      ${e}`);
}

const all = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : {};
all[KEY] = rows;
writeFileSync(OUT, JSON.stringify(all, null, 1), "utf-8");

const bad = rows.filter((r) => r.overflowX || r.js);
console.log(`\n── ${KEY}: ${PAGES.length} מסכים · ${bad.length ? `${bad.length} עם גלישה/שגיאת JS` : "אפס גלישה אופקית, אפס שגיאות JS"} ──`);
await b.close();
