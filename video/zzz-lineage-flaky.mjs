// האם /he/lineage נכשל לסירוגין? חמש כניסות טריות, מדידה בכל אחת.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
const net = [];
p.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && r.status() >= 400) net.push(`HTTP ${r.status()} ${u.replace(BASE,"").slice(0,90)}`); });
await login(p); await p.waitForTimeout(5000);
for (let i = 1; i <= 5; i++) {
  await p.goto(`${BASE}/he/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  const t0 = Date.now();
  await p.goto(`${BASE}/he/lineage`, { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);   // בדיוק כמו בסיור
  const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const err = /לא הצלחנו לטעון|שגיאה|Application error|נסו שוב/.test(t);
  const painted = await p.evaluate(() => {
    const el = [...document.querySelectorAll("h1,h2")].find((x) => /השושלת/.test(x.innerText));
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { opacity: cs.opacity, visible: el.getBoundingClientRect().height > 0 };
  });
  console.log(`ניסיון ${i}: ${((Date.now()-t0)/1000).toFixed(1)}s · אורך ${t.length} · ${err ? "‼️ מצב שגיאה" : "נקי"} · כותרת: ${JSON.stringify(painted)}`);
  if (err) { console.log("   " + t.slice(0, 300)); console.log("   " + await shot(p, `lineage-err-${i}`)); }
}
console.log("\nכשלי רשת:", net.length ? [...new Set(net)].join(" | ") : "אין");
console.log("שגיאות JS:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
