// ============================================================
// N13 — "בקטלוג אין את כל קורסי תחום המיקוד בסימון כוכב. תעמיק בזה"
// ------------------------------------------------------------
// המסקנה בקוד (`focus-star.ts`) היא שהקטלוג **נאמן לידיעון**: הידיעון
// מפרט סמינרים תחת "סמינר 4 ש״ס" — לפי ש״ס, לא לפי תחום — ותחום הסמינר
// הוא עובדה על **היכן הסטודנט מגיש את העבודה**, לא על הקורס. לכן יש
// שיוך אישי לכל משתמש, והקטלוג אמור לכבד אותו.
// כאן בודקים שזה באמת עובד על המסך.
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
const settle = async (ms = 4000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {}); };
await login(p); await settle();

// בוחרים תחום מיקוד בהגדרות
await p.goto(`${BASE}/he/settings`, { waitUntil: "networkidle" }); await settle(5000);
// הבורר הוא Select של Radix — trigger ואז option
const trig = p.locator('[aria-labelledby="settings-focus-label"]').first();
console.log("בורר תחום מיקוד:", await trig.count() ? "נמצא" : "לא נמצא");
if (await trig.count()) {
  await trig.click(); await p.waitForTimeout(1200);
  const opt = p.getByRole("option", { name: /פילוסופיה/ }).first();
  console.log("  אפשרות 'פילוסופיה':", await opt.count() ? "נמצאה" : "לא נמצאה");
  if (await opt.count()) { await opt.click(); await p.waitForTimeout(1200); }
  const save = p.getByRole("button", { name: /שמירה|שמרו|עדכון/ }).first();
  if (await save.count()) { await save.click(); await settle(5000); console.log("  נשמר"); }
}
const tS = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("תחום מיקוד:", (tS.match(/תחום מיקוד[^·|]{0,60}/) || ["?"])[0]);

// הקטלוג
await p.goto(`${BASE}/he/catalog`, { waitUntil: "networkidle" }); await settle(7000);
const m = await p.evaluate(() => {
  const rows = [...document.querySelectorAll("tr")];
  const starred = rows.filter((r) => r.querySelector("svg.lucide-star, svg[class*=star]"));
  return {
    rows: rows.length,
    starred: starred.length,
    sample: starred.slice(0, 5).map((r) => r.innerText.replace(/\s+/g, " ").slice(0, 55)),
    hasFocusFirst: /תחום המיקוד|המיקוד שלי/.test(document.body.innerText),
  };
});
console.log(`שורות בטבלה: ${m.rows} · מסומנות בכוכב: ${m.starred}`);
console.log("דוגמאות:", JSON.stringify(m.sample, null, 1));
console.log(`${m.starred > 0 ? "✅" : "❌"} N13 — הכוכב ${m.starred > 0 ? "נדלק לקורסי התחום" : "לא נדלק בכלל"}`);
console.log(await shot(p, "V-N13-catalog", { full: false }));

// השיוך האישי — הדלת שהקוד מתאר
await p.goto(`${BASE}/he/record`, { waitUntil: "networkidle" }); await settle(6000);
const tR = (await p.locator("body").innerText()).replace(/\s+/g, " ");
const prompt = tR.match(/[^.]*לא נספרים לאף תחום מיקוד[^.]*\.|[^.]*שייכו[^.]*\./);
console.log("\nהדלת לשיוך אישי:", prompt ? prompt[0].trim().slice(0, 200) : "(לא נמצאה במסך התיק)");
console.log(await shot(p, "V-N13-record", { full: false }));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
