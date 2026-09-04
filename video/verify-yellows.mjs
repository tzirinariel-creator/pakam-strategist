// ============================================================
// אימות חי של פריטי 🟡 — "הקוד כתוב, טרם נראה חי"
// ------------------------------------------------------------
// חוק הלוח: ✅ רק עם הוכחה ממסך אמיתי. כל פריט כאן נכתב, השער עבר,
// ואיש לא ראה אותו. או שהוא נסגר כאן, או שנמצא באג.
// ============================================================
import { openApp, login, shot, measure, report, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1200 });
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), null, { timeout: 45000 }).catch(() => {}); };
const txt = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const go = async (path) => { await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); await settle(6000); };
const out = [];
const check = (id, ok, detail) => { out.push({ id, ok, detail }); console.log(`${ok ? "✅" : "❌"} ${id} — ${detail}`); };

await login(p); await settle();

// ── N1 · M52 — מסך הפתיחה: טקסט למעלה, כרטיס בגובה תוכן ──────────
await p.goto(`${BASE}/he`, { waitUntil: "networkidle" }); await settle(4000);
const cards = await p.evaluate(() => {
  const heads = [...document.querySelectorAll("h3,h2")].filter((h) => /כל הקורסים בפנים|תכנון 3 שנים|דרישות התואר|המלך הפילוסוף/.test(h.innerText));
  return heads.map((h) => {
    const card = h.closest("div")?.parentElement ?? h.parentElement;
    const r = card.getBoundingClientRect();
    const hr = h.getBoundingClientRect();
    return { title: h.innerText.trim().slice(0, 24), cardH: Math.round(r.height), gapTop: Math.round(hr.top - r.top), align: getComputedStyle(card.parentElement).alignItems };
  });
});
console.log("כרטיסי הפתיחה:", JSON.stringify(cards));
const heights = cards.map((c) => c.cardH);
check("N1/M52", cards.length > 0 && new Set(heights).size > 1,
  cards.length ? `גבהים: ${heights.join(" · ")} — ${new Set(heights).size > 1 ? "כל כרטיס בגובה התוכן שלו (לא נמתח)" : "כולם באותו גובה — נמתחו"}` : "לא נמצאו כרטיסים");
console.log("  " + await shot(p, "Y-N1-landing"));

await login(p).catch(() => {});
// ── M33 — הסבר בראש "דרישות התואר" ────────────────────────────────
await go("/he/regulations");
const t33 = await txt();
const i33 = t33.indexOf("דרישות התואר");
check("M33", /התואר שלכם|מה נדרש|בנוי מ|150 ש״ס/.test(t33.slice(0, 1400)),
  t33.slice(i33 >= 0 ? i33 : 0, (i33 >= 0 ? i33 : 0) + 240));
console.log("  " + await shot(p, "Y-M33-requirements", { full: true }));
report("דרישות התואר", await measure(p), errors);

// ── M38 · M39 · M41 · M40 — מצב הסימולציה ─────────────────────────
await go("/he/graduation");
const sim = p.getByRole("button", { name: /סימולצי|מה יקרה לממוצע/ }).first();
console.log("כפתור הסימולציה:", await sim.count() ? (await sim.innerText()).trim() : "לא נמצא");
if (await sim.count()) { await sim.click(); await settle(4000); }
const tS = await txt();
check("M38", !/גם ציון 100 בקורס הזה לא יביא את הממוצע/.test(tS), /גם ציון 100/.test(tS) ? "‼️ הניסוח הישן עדיין על המסך" : "הניסוח הישן לא מופיע");
const bdi = await p.evaluate(() => {
  const nums = [...document.querySelectorAll("bdi[dir=ltr]")].map((e) => e.innerText.trim()).filter(Boolean);
  const flipped = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^\d+\.\d+ ?[-–] ?\d/.test(e.innerText || "")).map((e) => e.innerText.trim());
  return { bdis: nums.slice(0, 12), suspicious: flipped.slice(0, 6) };
});
check("M39", bdi.bdis.length > 0, `bdi[dir=ltr] על המסך: ${bdi.bdis.length} — ${bdi.bdis.slice(0, 6).join(" · ")}`);
console.log("  " + await shot(p, "Y-sim", { full: true }));
report("סימולציה", await measure(p), errors);

// ── M43 · N6 — תכנון מבחנים פר סמסטר ──────────────────────────────
await go("/he/exam-planner");
const t43 = await txt();
const per = t43.match(/סמסטר [אב]׳[^·|]{0,60}/g);
check("M43/N6", /סמסטר [אב]׳|תקופת המבחנים/.test(t43), per ? per.slice(0, 3).join(" | ") : t43.slice(0, 160));

// ── N10 — כפתור המלך בכל מסך ──────────────────────────────────────
const kingOn = [];
for (const path of ["/he/dashboard", "/he/planner", "/he/catalog", "/he/graduation", "/he/exam", "/he/settings"]) {
  await go(path);
  const k = await p.locator("button", { hasText: /המלך הפילוסוף|הרפרנט/ }).count();
  kingOn.push(`${path.replace("/he", "")}=${k > 0 ? "✓" : "✗"}`);
}
check("N10", !kingOn.some((s) => s.endsWith("✗")), kingOn.join(" "));

console.log("\n── סיכום ──");
for (const o of out) console.log(`${o.ok ? "✅" : "❌"} ${o.id}`);
console.log("שגיאות JS:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
