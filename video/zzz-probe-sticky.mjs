import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 800 });
const settle = async (ms = 4000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {}); };
await login(p); await settle();
await p.goto(`${BASE}/he/graduation`, { waitUntil: "networkidle" }); await settle(6000);
await p.getByRole("button", { name: /מה יקרה לממוצע אם/ }).first().click(); await settle(3000);
const e = p.getByRole("button", { name: /^בואו נראה$/ }).first();
if (await e.count()) { await e.click(); await settle(3500); }
await p.evaluate(() => window.scrollTo(0, 2200));
await p.waitForTimeout(1500);
const m = await p.evaluate(() => {
  const lbl = [...document.querySelectorAll("p")].find((x) => /ממוצע בסימולציה/.test(x.innerText));
  const box = lbl?.parentElement?.parentElement;
  const num = lbl?.parentElement?.querySelectorAll("p")[1];
  // כל אלמנט קבוע/דביק שיושב בראש המסך ויכול לכסות
  const covers = [...document.querySelectorAll("*")].filter((x) => {
    const cs = getComputedStyle(x);
    if (cs.position !== "fixed" && cs.position !== "sticky") return false;
    const r = x.getBoundingClientRect();
    return r.top <= 2 && r.height > 20 && r.width > 300 && x !== box && !box?.contains(x);
  }).map((x) => ({ tag: x.tagName, cls: (x.className || "").toString().slice(0, 60), h: Math.round(x.getBoundingClientRect().height), z: getComputedStyle(x).zIndex }));
  return {
    sticky: box ? { top: Math.round(box.getBoundingClientRect().top), h: Math.round(box.getBoundingClientRect().height), z: getComputedStyle(box).zIndex } : null,
    headline: num ? { top: Math.round(num.getBoundingClientRect().top), text: num.innerText.replace(/\s+/g, " ") } : null,
    covers,
  };
});
console.log(JSON.stringify(m, null, 1));
if (m.headline && m.covers.length) {
  const barH = Math.max(...m.covers.map((c) => c.h));
  console.log(`\nהכותרת מתחילה ב-${m.headline.top}px; הסרגל העליון תופס 0–${barH}px.`);
  console.log(m.headline.top < barH ? `‼️ המספר מוסתר מתחת לסרגל העליון` : "✓ המספר מתחת לסרגל, נראה");
}
await b.close();
