// N1 · M52 — כרטיסי מסך הפתיחה: הטקסט למעלה, הכרטיס בגובה התוכן
// (בלי התחברות — /he מפנה לדשבורד למשתמש מחובר, וזה מה שהחמצתי קודם)
import { openApp, shot, measure, report, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
await p.goto(`${BASE}/he`, { waitUntil: "networkidle" });
await p.waitForTimeout(4000);
const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("דף הנחיתה:", t.slice(0, 300));
const rows = await p.evaluate(() => {
  // כל רשת של כרטיסים — נמדוד גובה ויישור
  const out = [];
  for (const g of document.querySelectorAll('[class*="grid"]')) {
    const kids = [...g.children].filter((c) => c.getBoundingClientRect().height > 60);
    if (kids.length < 2) continue;
    const hs = kids.map((c) => Math.round(c.getBoundingClientRect().height));
    if (new Set(hs).size === 0) continue;
    out.push({
      align: getComputedStyle(g).alignItems,
      heights: hs,
      sample: (kids[0].innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
    });
  }
  return out.slice(0, 10);
});
console.log("\nרשתות כרטיסים (יישור · גבהים · דוגמה):");
for (const r of rows) console.log(`  ${r.align.padEnd(10)} ${r.heights.join(",").padEnd(24)} «${r.sample}»`);
const stretched = rows.filter((r) => r.align === "stretch" || r.align === "normal");
console.log(`\nרשתות ב-stretch/normal: ${stretched.length} מתוך ${rows.length}`);
console.log(await shot(p, "Y-landing-cards", { full: true }));
report("דף נחיתה", await measure(p), errors);
await b.close();
