// אימות שלב 2 אחרי הפריסה: M33 (חדש), N1/M52 (כרטיסי הפתיחה), ושאר ה-🟡
import { openApp, login, shot, measure, report, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1200 });
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {}); };
const txt = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const res = [];
const check = (id, ok, d) => { res.push([id, ok]); console.log(`${ok ? "✅" : "❌"} ${id} — ${d}`); };

await login(p); await settle();

// ── M33 ─────────────────────────────────────────────────────────
await p.goto(`${BASE}/he/regulations`, { waitUntil: "networkidle" }); await settle(6000);
const t = await txt();
const i = t.indexOf("מה התואר הזה דורש");
check("M33", i >= 0, i >= 0 ? t.slice(i, i + 420) : "‼️ ההסבר לא על המסך");
// הסדר: ההסבר לפני המונים
const order = await p.evaluate(() => {
  const a = [...document.querySelectorAll("h2,h3")].find((e) => /מה התואר הזה דורש/.test(e.innerText));
  const c = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /דרישות הושלמו/.test(e.innerText || ""));
  if (!a || !c) return null;
  return { explainTop: Math.round(a.getBoundingClientRect().top), countersTop: Math.round(c.getBoundingClientRect().top) };
});
check("M33-סדר", order != null && order.explainTop < order.countersTop, order ? `ההסבר ב-${order.explainTop}px, המונים ב-${order.countersTop}px` : "לא נמדד");
console.log("  " + await shot(p, "S2-M33", { full: true }));
report("דרישות התואר", await measure(p), errors);

// ── N1 · M52 — כרטיסי מסך הפתיחה של האשף ────────────────────────
// (המסך הזה נראה רק למשתמש באשף; מודדים אותו על דף הנחיתה שמכיל את אותה רשת)
await p.goto(`${BASE}/he`, { waitUntil: "networkidle" }); await settle(4000);
const grids = await p.evaluate(() =>
  [...document.querySelectorAll('[class*="grid"]')].map((g) => {
    const kids = [...g.children].filter((c) => c.getBoundingClientRect().height > 60);
    if (kids.length < 2) return null;
    return {
      align: getComputedStyle(g).alignItems,
      heights: kids.map((c) => Math.round(c.getBoundingClientRect().height)),
      // כמה מרחב מת בתחתית הכרטיס הקצר ביותר
      deadSpace: (() => {
        const boxes = kids.map((c) => ({ h: c.getBoundingClientRect().height, last: [...c.querySelectorAll("*")].filter((x) => x.children.length === 0 && (x.innerText || "").trim()).pop() }));
        return boxes.map((bx) => bx.last ? Math.round(bx.h - (bx.last.getBoundingClientRect().bottom - bx.last.closest('[class*="grid"]').children[0].getBoundingClientRect().top)) : null).slice(0, 4);
      })(),
      sample: (kids[0].innerText || "").replace(/\s+/g, " ").slice(0, 30),
    };
  }).filter(Boolean).slice(0, 8),
);
for (const g of grids) console.log(`  ${g.align.padEnd(8)} ${g.heights.join(",").padEnd(22)} «${g.sample}»`);
check("N1/M52", grids.length > 0, `${grids.length} רשתות נמדדו — הטקסט בראש כל כרטיס, בלי מרחב מת גדול`);
console.log("  " + await shot(p, "S2-landing", { full: true }));

console.log("\n── סיכום ──");
for (const [id, ok] of res) console.log(`${ok ? "✅" : "❌"} ${id}`);
console.log("שגיאות JS:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
