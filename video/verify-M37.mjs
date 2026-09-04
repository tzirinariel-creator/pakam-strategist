// אימות M37/N12/T11 חי אחרי הפריסה
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1200 });
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 40000 }).catch(() => {}); };
await login(p); await settle();

for (const [path, name] of [["/he/graduation", "מחשבון-ציון-גמר"], ["/he/exam-planner", "מתכנן-מבחנים"]]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); await settle(6000);
  const info = await p.evaluate(() => ({
    ranges: document.querySelectorAll('input[type="range"]').length,
    numbers: [...document.querySelectorAll('input[type="number"]')].map((e) => ({
      label: e.getAttribute("aria-label"), value: e.value, min: e.min, max: e.max,
    })),
    steppers: [...document.querySelectorAll("button[aria-label*='פחות'],button[aria-label*='יותר']")]
      .map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)} ${e.getAttribute("aria-label")}`; }),
  }));
  console.log(`\n════ ${name} ════`);
  console.log("  מחווני גרירה שנשארו:", info.ranges);
  console.log("  שדות מספר:", JSON.stringify(info.numbers));
  console.log("  כפתורי ±:", info.steppers.join(" · ") || "אין");
  console.log("  " + await shot(p, `V-M37-${name}`, { full: true }));
}
// סרגל המשקלים
await p.goto(`${BASE}/he/graduation`, { waitUntil: "networkidle" }); await settle(6000);
const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
const line = t.match(/[^.]*המשקל[^.]*עוד אין לכם[^.]*\./) || t.match(/[^.]*המשקלים שלהם[^.]*\./);
console.log("\nשורת ההסבר לפלחים הריקים:", line ? line[0].trim() : "(לא נמצאה)");
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
