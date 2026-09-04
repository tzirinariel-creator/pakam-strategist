// צילומי המסכים שאריאל אמר שהם בינוניים — לביקורת HIG
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const MOBILE = process.argv.includes("--mobile");
const { b, p, errors } = await openApp(MOBILE ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 1000 });
const tag = MOBILE ? "M" : "D";
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {}); };
const dismiss = async () => { for (let i=0;i<3;i++){ if(!(await p.locator("[data-slot=dialog-overlay]").count()))return; const c=p.getByRole("button",{name:/^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/}).first(); if(await c.count())await c.click().catch(()=>{}); else await p.keyboard.press("Escape"); await p.waitForTimeout(800);} };

// 1 · דף הנחיתה — בלי התחברות
await p.goto(`${BASE}/he`, { waitUntil: "networkidle" }); await settle(4000);
console.log(await shot(p, `HIG-${tag}-1-נחיתה`, { full: true }));

await login(p); await settle(6000);
// 2 · האשף
console.log(await shot(p, `HIG-${tag}-2-אשף`, { full: true }));
// 3 · מתכנן המבחנים
await p.goto(`${BASE}/he/exam-planner`, { waitUntil: "networkidle" }); await settle(7000); await dismiss();
console.log(await shot(p, `HIG-${tag}-3-מתכנן-מבחנים`, { full: true }));
// 4 · מצב הסימולציה
await p.goto(`${BASE}/he/graduation`, { waitUntil: "networkidle" }); await settle(7000);
const sim = p.getByRole("button", { name: /מה יקרה לממוצע אם/ }).first();
if (await sim.count()) { await sim.click(); await settle(3000);
  const e = p.getByRole("button", { name: /^בואו נראה$/ }).first();
  if (await e.count()) { await e.click(); await settle(4000); } }
console.log(await shot(p, `HIG-${tag}-4-סימולציה`, { full: true }));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
