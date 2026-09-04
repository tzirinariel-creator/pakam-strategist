import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1200 });
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 40000 }).catch(() => {}); };
await login(p); await settle();
await p.goto(`${BASE}/he/exam-planner`, { waitUntil: "networkidle" }); await settle(6000);
const d = p.getByRole("button", { name: /כוונון מחדש/ }).first();
console.log("אקורדיון 'כוונון מחדש':", await d.count() ? "נמצא" : "לא נמצא");
if (await d.count()) { await d.click(); await settle(4000); }
const info = await p.evaluate(() => ({
  ranges: document.querySelectorAll('input[type="range"]').length,
  numbers: [...document.querySelectorAll('input[type="number"]')].map((e) => ({ label: e.getAttribute("aria-label"), value: e.value, min: e.min })),
  steppers: [...document.querySelectorAll("button[aria-label*='פחות'],button[aria-label*='יותר']")].map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)}`; }),
}));
console.log("מחווני גרירה:", info.ranges, "· שדות מספר:", JSON.stringify(info.numbers), "· ± :", info.steppers.join(" "));
const el = await p.locator("text=כדאי לגשת למועד ב׳").first();
if (await el.count()) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(800); }
console.log(await shot(p, "V-M37-moedb"));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
