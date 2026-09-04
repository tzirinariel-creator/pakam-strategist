// מה בדיוק קורה בין "הכול מוכן" לבין "אין קורסים בתוכנית"?
// עוקב אחרי כל קריאת tRPC אחרי השמירה, ואחרי כל החלפת מסך — בלי אף לחיצה.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { fileURLToPath } from "node:url";
const SHEET = fileURLToPath(new URL("./fixtures/sheet-year2.png", import.meta.url));
const { b, p, errors } = await openApp();
const calls = [];
let t0 = 0;
p.on("request", (r) => {
  const u = r.url();
  if (!u.includes("/api/trpc")) return;
  const m = u.match(/trpc\/([^?]+)/);
  if (t0) calls.push({ at: ((Date.now() - t0) / 1000).toFixed(1), op: decodeURIComponent(m?.[1] ?? u).slice(0, 90) });
});
const ready = async (re, ms = 60000) => {
  try { await p.waitForFunction((s) => !document.querySelector("[class*=animate-pulse]") && new RegExp(s).test(document.body.innerText), re.source, { timeout: ms }); return true; } catch { return false; }
};
await login(p);
await ready(/בואו נתחיל|התואר שלכם/, 90000);
await p.getByRole("button", { name: /^בואו נתחיל$/ }).first().click();
await ready(/כבר יש לכם ש/, 40000);
await p.getByRole("button", { name: /כבר יש לכם ש/ }).first().click();
await ready(/העלו את גיליון|בחרו קובץ/, 40000);
await p.locator("input[type=file]").first().setInputFiles(SHEET);
await p.waitForFunction(() => /קראנו|לא הצלחנו/.test(document.body.innerText), { timeout: 150000 });
await p.waitForTimeout(2500);
await p.getByRole("button", { name: /^נכון — המשיכו מכאן$/ }).first().click();
await p.waitForTimeout(4000);
await p.getByRole("button", { name: /^הבא$/ }).first().click();
await p.waitForTimeout(4000);

console.log("לוחץ 'סיום ושמירה' — ומכאן לא נוגע במסך בכלל\n");
t0 = Date.now();
await p.getByRole("button", { name: /^סיום ושמירה$/ }).first().click();

let last = "";
for (let i = 0; i < 130; i++) {
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => {
    const skip = /זה לא אתר רשמי|^פכמון$/;
    const h = [...document.querySelectorAll("h1,h2,h3")].map((e) => e.innerText.trim()).filter((t) => t && !skip.test(t))[0] || "";
    const txt = document.body.innerText;
    return { h, empty: /אין קורסים בתוכנית שלכם/.test(txt), done: /הכול מוכן/.test(txt), planned: (txt.match(/(\d+) מתוכננים/) || [])[1] || "" };
  }).catch(() => ({ h: "(ניווט)", empty: false, done: false, planned: "" }));
  const key = `${s.h}|${s.empty}|${s.done}`;
  if (key !== last) {
    last = key;
    console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  «${s.h}»  ${s.done ? "[הכול מוכן]" : ""} ${s.empty ? "‼️ [אין קורסים בתוכנית]" : ""} ${s.planned ? "מתוכננים=" + s.planned : ""}`);
  }
}
console.log("\n── קריאות tRPC מרגע הלחיצה ──");
for (const c of calls) console.log(`  ${c.at.padStart(6)}s  ${c.op}`);
const refetchedPlan = calls.filter((c) => /plan\.getUserPlan/.test(c.op));
console.log(`\nplan.getUserPlan נקרא ${refetchedPlan.length} פעמים אחרי השמירה: ${refetchedPlan.map((c) => c.at + "s").join(", ") || "אף פעם"}`);
console.log(await shot(p, "PROBE-L3-end"));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
