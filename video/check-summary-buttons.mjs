// A4 — סדר הכפתורים במסך הסיכום, נמדד ולא נאמד.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
await p.goto(`${BASE}/he/planner/semester`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(12000);
// לסגור מודאלים שנפתחים בכניסה
await p.evaluate(() => {
  for (const el of document.querySelectorAll("button")) {
    if (/הבנתי/.test(el.innerText)) el.click();
  }
});
await p.waitForTimeout(1500);
// למסך הסיכום
const went = await p.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((el) => /סיימתם את הסמסטר/.test(el.innerText));
  if (!b) return false; b.click(); return true;
});
console.log("עברנו למסך הסיכום:", went);
await p.waitForTimeout(3500);
await shot(p, "V69-A4-summary", { full: true });
const rows = await p.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((el) => /הוספה ועריכה|סיום ושמירה|תכננו סמסטר נוסף/.test(el.innerText))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { label: el.innerText.replace(/\s+/g," ").trim(), top: Math.round(r.top + window.scrollY),
               w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor,
               color: cs.color, weight: cs.fontWeight, border: cs.borderTopWidth };
    })
    .sort((a, b) => a.top - b.top));
for (const r of rows) console.log(`${String(r.top).padStart(5)}  ${r.label.padEnd(24)} ${r.w}×${r.h}  רקע=${r.bg}  טקסט=${r.color}  משקל=${r.weight}  מסגרת=${r.border}`);
const t = await p.evaluate(() => document.body.innerText);
const i = t.indexOf("הוספה ועריכה");
console.log("\n--- הטקסט סביב ---\n" + (i<0 ? "(לא נמצא)" : t.slice(Math.max(0,i-260), i+260)));
await b.close();
