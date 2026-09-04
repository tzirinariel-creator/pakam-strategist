// אימות M44/M45 חי אחרי הפריסה
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1200 });
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), null, { timeout: 40000 }).catch(() => {}); };
await login(p); await settle();
await p.goto(`${BASE}/he/exam-planner`, { waitUntil: "networkidle" }); await settle(7000);
const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
const banner = t.match(/התוכנית בנויה — היא פשוט מתחילה רק ב־[^.]*\./);
console.log("באנר:", banner ? banner[0] : "(אין)");
const gap = t.match(/\d+ ימים חופשיים · [\d.]+–[\d.]+ — אין מה ללמוד\. להצגה/g);
console.log("שורות קיפול בלוח:", gap ? gap.join(" | ") : "אין");
const legend = /כל תא הוא יום אחד/.test(t);
console.log("מקרא הלוח:", legend ? "✅ קיים" : "❌ חסר");
// השורה הראשונה בלוח — האם היא ריקה?
const firstRow = await p.evaluate(() => {
  const h = [...document.querySelectorAll("h3")].find((e) => /הלוח השבועי שלכם/.test(e.innerText));
  if (!h) return null;
  const card = h.closest("div")?.parentElement;
  const rows = [...(card?.querySelectorAll(".grid.grid-cols-7") ?? [])];
  return rows.slice(1, 3).map((r) => r.innerText.replace(/\s+/g, " ").slice(0, 150));
});
console.log("שתי שורות ראשונות:", JSON.stringify(firstRow, null, 1));
console.log(await shot(p, "V-M44-grid", { full: true }));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
