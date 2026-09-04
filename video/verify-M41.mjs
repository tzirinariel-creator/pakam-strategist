// ============================================================
// M41 — "כשאני לוחץ על שינוי ציון בסימולציה, אם הציון יחסית למטה,
//        אין לי דרך לראות את ההשפעה שלו על הממוצע. אז מה זה עוזר?"
// ------------------------------------------------------------
// התיקון הוא בלוק `sticky top-0` עם הממוצע והדלתא. sticky נשבר בשקט
// כשאב כלשהו מגדיר overflow — בדיוק המלכודת שמתועדת בסקייליין. אז לא
// מספיק שהקוד כתוב: צריך לגלול לקורס האחרון, לשנות אותו, ולמדוד שהבלוק
// באמת בתוך המסך ושהמספר באמת השתנה.
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 800 });
const settle = async (ms = 4000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), null, { timeout: 45000 }).catch(() => {}); };
await login(p); await settle();
await p.goto(`${BASE}/he/graduation`, { waitUntil: "networkidle" }); await settle(6000);

const sim = p.getByRole("button", { name: /מה יקרה לממוצע אם/ }).first();
if (!(await sim.count())) { console.log("❌ לא נמצא כפתור הסימולציה"); await b.close(); process.exit(1); }
await sim.click(); await settle(3000);
// המצב נפתח מאחורי מסך הסבר — "בואו נראה" הוא הכפתור שנכנס בפועל
const enter = p.getByRole("button", { name: /^בואו נראה$/ }).first();
if (await enter.count()) { console.log("לוחץ «בואו נראה»"); await enter.click(); await settle(3500); }

// "בתוך המסך" אינו מספיק. הגרסה הראשונה של הבדיקה הזאת בדקה
// `bottom > 0` והכריזה ✅ על מסך שבו המספר ישב מתחת לסרגל העליון.
// אז היא מודדת עכשיו מול הסרגל עצמו: מה שמכוסה, לא נראה.
const readHead = () => p.evaluate(() => {
  const lbl = [...document.querySelectorAll("p")].find((e) => /ממוצע בסימולציה/.test(e.innerText));
  if (!lbl) return null;
  const box = lbl.parentElement.parentElement;      // הבלוק ה-sticky
  const num = lbl.parentElement.querySelectorAll("p")[1];
  const r = box.getBoundingClientRect();
  const nr = num?.getBoundingClientRect();
  // כל דבר קבוע שיושב בראש המסך עם z גבוה יותר ויכול לכסות
  const barBottom = Math.max(0, ...[...document.querySelectorAll("*")].filter((x) => {
    const cs = getComputedStyle(x);
    if (cs.position !== "fixed") return false;
    const b = x.getBoundingClientRect();
    return b.top <= 2 && b.height > 20 && b.width > 300 && !box.contains(x)
      && Number(cs.zIndex || 0) > Number(getComputedStyle(box).zIndex || 0);
  }).map((x) => x.getBoundingClientRect().bottom));
  return {
    text: (num?.innerText || "").replace(/\s+/g, " ").trim(),
    top: Math.round(r.top),
    headlineTop: nr ? Math.round(nr.top) : null,
    barBottom: Math.round(barBottom),
    visible: !!nr && nr.top >= barBottom - 1 && nr.bottom < window.innerHeight,
    position: getComputedStyle(box).position,
  };
});

const before = await readHead();
console.log("לפני:", JSON.stringify(before));

// הקורס האחרון ברשימה — הכי רחוק מהכותרת
const btns = await p.evaluate(() => [...document.querySelectorAll("button")].map((e) => (e.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean));
console.log("כפתורים על המסך:", JSON.stringify([...new Set(btns)].slice(0, 25)));
const plus = p.locator("button").filter({ hasText: /^\+5$/ });
const n = await plus.count();
console.log(`כפתורי +5: ${n}`);
if (n === 0) { console.log("❌ אין כפתורי שינוי ציון — הסימולציה לא נפתחה או אין קורסים עם ציון"); console.log(await shot(p, "V-M41-nobuttons", { full: true })); await b.close(); process.exit(1); }
const last = plus.nth(n - 1);
await last.scrollIntoViewIfNeeded();
await p.waitForTimeout(1200);
const scrolled = await p.evaluate(() => Math.round(window.scrollY));
console.log(`גללתי ל-${scrolled}px — הקורס האחרון ברשימה`);
const midScroll = await readHead();
console.log("אחרי גלילה, לפני לחיצה:", JSON.stringify(midScroll));

await last.click();
await p.waitForTimeout(2000);
const after = await readHead();
console.log("אחרי לחיצה:", JSON.stringify(after));

const ok = after && after.visible && after.text !== before?.text;
console.log(`\n${ok ? "✅" : "❌"} M41 — ${
  !after ? "הבלוק לא נמצא"
  : !after.visible ? `‼️ המספר לא נראה: מתחיל ב-${after.headlineTop}px והסרגל העליון נגמר ב-${after.barBottom}px`
  : after.text === before?.text ? `הבלוק נראה אבל המספר לא השתנה (${after.text})`
  : `המספר נראה מתחת לסרגל (כותרת ב-${after.headlineTop}px, הסרגל נגמר ב-${after.barBottom}px) והוא עבר מ-«${before.text}» ל-«${after.text}»`}`);
console.log(await shot(p, "V-M41-sticky"));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
