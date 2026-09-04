import { openApp, login, shot, measure, report, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp();
const T = async () => (await p.locator("body").innerText()).replace(/\n+/g, " | ");
const body = async () => { const t = await T(); const i = t.indexOf("החלטות גדולות."); return i>=0 ? t.slice(i+16) : t; };
const btns = async () => p.evaluate(() =>
  [...document.querySelectorAll("button")].map(x=>x.innerText.trim().replace(/\n/g," ")).filter(x=>x&&x.length<60));
async function step(name, note) {
  const f = await shot(p, name);
  console.log(`\n━━━ ${name} ━━━  ${note??""}`);
  console.log((await body()).slice(0, 800));
  console.log("   כפתורים:", JSON.stringify((await btns()).slice(0,16)));
  report(name, await measure(p), errors);
  return f;
}
async function click(re, label) {
  const el = p.getByRole("button", { name: re }).first();
  if (!(await el.count())) { console.log(`   ✗ לא נמצא: ${label}`); return false; }
  await el.click().catch(e=>console.log("   קליק נכשל:",String(e).slice(0,60)));
  await p.waitForTimeout(3800); return true;
}

await p.goto(`${BASE}/he`, { waitUntil: "networkidle" }); await p.waitForTimeout(4000);
await step("landing", "דף הנחיתה — הערות 1, 2, 32");
await p.goto(`${BASE}/he/login`, { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
await step("login", "הערה ב.2 — השם המפחיד של גוגל");
await login(p); await p.waitForTimeout(5000);

await step("wiz-1-welcome", "הערות ב.1 ב.3 — 'שלושה חוגים' והמקום הריק");
await click(/^פכ״מ/, "בחירת פכ״מ"); await click(/בואו נתחיל/, "בואו נתחיל");
await step("wiz-2-standing", "נקודת הפתיחה");
await click(/מתחילים את התואר עכשיו/, "שנה א׳ מאפס");
await step("wiz-3-profile", "הפרופיל");
// ממלא את הפרופיל: שנה א׳, סמסטר, מגדר, תחום
for (const re of [/^שנה א׳$/, /^סמסטר א׳$/, /^זכר$/, /^כלכלה$/]) {
  const el = p.getByRole("button", { name: re }).first();
  if (await el.count()) { await el.click().catch(()=>{}); await p.waitForTimeout(900); }
}
await step("wiz-3b-profile-filled", "אחרי מילוי");
await click(/^(הבא|המשך)/, "הבא");
await step("wiz-4-timetable", "★ הערה ב.6 — 'לא הבנתי כלום במסך מערכת השעות'");
await click(/^(הבא|המשך|סיום ושמירה)/, "המשך מהמערכת");
await step("wiz-5", "המשך");
await click(/^(הבא|המשך|סיום ושמירה|סיום)/, "המשך");
await step("wiz-6-ready", "★ הערה ב.13 — 'הכול מוכן' והקפיצה");
console.log("\n=== שגיאות ===", errors.length ? [...new Set(errors)].join("\n") : "אין");
await b.close();
