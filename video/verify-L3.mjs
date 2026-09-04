// אימות L3 אחרי הפריסה: הפינאלה נשארת, והיציאה ממנה נוחתת על דף בית נכון
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { fileURLToPath } from "node:url";
const SHEET = fileURLToPath(new URL("./fixtures/sheet-year2.png", import.meta.url));
const { b, p, errors } = await openApp();
const ready = async (re, ms = 90000) => {
  try { await p.waitForFunction((s) => !document.querySelector("[class*=animate-pulse]") && new RegExp(s).test(document.body.innerText), re.source, { timeout: ms }); return true; } catch { return false; }
};
const txt = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");

await login(p);
await ready(/בואו נתחיל|התואר שלכם/);
await p.getByRole("button", { name: /^בואו נתחיל$/ }).first().click();
await ready(/כבר יש לכם ש/, 40000);
await p.getByRole("button", { name: /כבר יש לכם ש/ }).first().click();
await ready(/העלו את גיליון|בחרו קובץ/, 40000);
await p.locator("input[type=file]").first().setInputFiles(SHEET);
await p.waitForFunction(() => /קראנו|לא הצלחנו/.test(document.body.innerText), null, { timeout: 150000 });
await p.waitForTimeout(2500);
await p.getByRole("button", { name: /^נכון — המשיכו מכאן$/ }).first().click();
await p.waitForTimeout(4000);
await p.getByRole("button", { name: /^הבא$/ }).first().click();
await p.waitForTimeout(4000);

console.log("שומר…");
const tSave = Date.now();
await p.getByRole("button", { name: /^סיום ושמירה$/ }).first().click();
// L1: על שמירה בריאה אסור שתופיע האזהרה "לוקח קצת יותר מהרגיל"
let warned = null;
const watch = (async () => {
  while (Date.now() - tSave < 120000) {
    const t = await p.locator("body").innerText().catch(() => "");
    if (/לוקח קצת יותר מהרגיל/.test(t) && warned === null) warned = (Date.now() - tSave) / 1000;
    if (/הכול מוכן/.test(t)) return;
    await p.waitForTimeout(400);
  }
})();
await p.waitForFunction(() => /הכול מוכן/.test(document.body.innerText), null, { timeout: 120000 });
await watch;
const saveSecs = (Date.now() - tSave) / 1000;
console.log(`✅ הפינאלה 'הכול מוכן' הופיעה אחרי ${saveSecs.toFixed(1)}s`);
console.log(`L1 — אזהרת "לוקח קצת יותר מהרגיל": ${warned === null ? "✅ לא הופיעה" : `❌ הופיעה ב-${warned}s`}`);

// הפינאלה חייבת להחזיק. לפני התיקון היא נעלמה מעצמה אחרי 3.6 שניות.
await p.waitForTimeout(20000);
const stillThere = /הכול מוכן/.test(await txt());
console.log(`אחרי 20 שניות בלי לגעת: ${stillThere ? "✅ הפינאלה עדיין על המסך" : "❌ הפינאלה נעלמה"}`);
console.log(await shot(p, "V-L3-finale-holds"));

// היציאה — הכפתור הראשי
const go = p.getByRole("button", { name: /לדף הבית|למסך הבית|לתוכנית שלי|הבית/ }).first();
const label = (await go.count()) ? (await go.innerText()).trim() : "(לא נמצא)";
console.log(`\nלוחץ על «${label}»`);
if (await go.count()) await go.click();
await p.waitForTimeout(12000);
await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), null, { timeout: 60000 }).catch(() => {});
const t = await txt();
const lie = /אין קורסים בתוכנית שלכם/.test(t);
const planned = (t.match(/(\d+) מתוכננים/) || [])[1] || "?";
const credits = (t.match(/(\d+) \/ 150/) || [])[1] || "?";
console.log(`URL: ${p.url().replace(BASE, "")}`);
console.log(`כרטיס "אין קורסים בתוכנית": ${lie ? "❌ עדיין מופיע" : "✅ לא מופיע"}`);
console.log(`המד: ${credits}/150 ש״ס · ${planned} מתוכננים`);
console.log(await shot(p, "V-L3-dashboard"));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
