// אבחון הממצא היחיד שנשאר: <bdi> עם טווח שעות שנמדד מחוץ למסך.
// מטרה: לדעת מה מחזיק אותו שם — לא לנחש. מדפיס את שרשרת ההורים,
// ה-overflow והרוחב של כל אחד, ובודק אם Radix מזיז את הגוף בדיאלוג.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const W = +(process.argv.includes("--width") ? process.argv[process.argv.indexOf("--width")+1] : 1440);
const { b, p } = await openApp({ width: W, height: W < 700 ? 844 : 1100 });
const probe = async (tag) => {
  const r = await p.evaluate((t) => {
    const de = document.documentElement, out = [];
    for (const el of document.querySelectorAll("bdi")) {
      const box = el.getBoundingClientRect();
      if (!box.width) continue;
      if (box.right <= de.clientWidth + 2 && box.left >= -2) continue;
      const chain = [];
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a), ab = a.getBoundingClientRect();
        chain.push(`${a.tagName.toLowerCase()}${a.className && typeof a.className === "string" ? "." + a.className.trim().split(/\s+/).slice(0,3).join(".") : ""} [w=${Math.round(ab.width)} l=${Math.round(ab.left)} ox=${cs.overflowX} minW=${cs.minWidth} ws=${cs.whiteSpace}]`);
        if (chain.length >= 7) break;
      }
      out.push({ txt: el.innerText.trim(), left: Math.round(box.left), right: Math.round(box.right), chain });
    }
    const bs = getComputedStyle(document.body);
    return { tag: t, vw: de.clientWidth, bodyPad: `${bs.paddingInlineStart}/${bs.paddingInlineEnd}`,
             bodyMargin: `${bs.marginInlineStart}/${bs.marginInlineEnd}`, found: out.slice(0, 2) };
  }, tag);
  console.log(`\n=== ${r.tag} · רוחב ${r.vw} · ריפוד גוף ${r.bodyPad} · שוליים ${r.bodyMargin}`);
  if (!r.found.length) { console.log("  אין bdi חורג"); return; }
  for (const f of r.found) {
    console.log(`  <bdi>"${f.txt}"  left=${f.left} right=${f.right}`);
    f.chain.forEach((c, i) => console.log(`    ${"  ".repeat(i)}↑ ${c}`));
  }
};
try {
  await login(p); await p.waitForTimeout(5000);
  await p.goto(`${BASE}/he/planner`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 800, null, { timeout: 40000 }).catch(()=>{});
  await p.waitForTimeout(6000);
  await probe("תכנון · לפני שיתוף");
  const btn = p.locator("main button").filter({ hasText: /^שתף$/ }).first();
  if (await btn.count()) {
    await btn.click(); await p.waitForTimeout(3500);
    await probe("תכנון · דיאלוג השיתוף פתוח");
    await shot(p, `bdi-share-${W}`);
  } else console.log("\n(לא נמצא כפתור שתף)");
  await p.keyboard.press("Escape"); await p.waitForTimeout(1200);
  await p.goto(`${BASE}/he/calendar`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 800, null, { timeout: 40000 }).catch(()=>{});
  await p.waitForTimeout(6000);
  await probe("יומן");
  await shot(p, `bdi-calendar-${W}`);
} finally { await b.close(); }
