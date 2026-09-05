// שלושת כפתורי-השאלה שמופיעים רק במצב מסוים — נבדקים במצב הזה.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

const check = async (name) => {
  await p.waitForTimeout(1200);
  const n = await p.evaluate(() => document.querySelectorAll('button[aria-label*="שאל"]').length);
  if (n === 0) return console.log(`❌ ${name}: הכפתור לא מופיע`);
  await p.evaluate(() => document.querySelector('button[aria-label*="שאל"]')?.click());
  await p.waitForTimeout(1400);
  const r = await p.evaluate(() => {
    const v = [...document.querySelectorAll("textarea,input")].map((f) => f.value || "").filter((x) => x.trim().length > 8);
    return v[0] ?? null;
  });
  console.log(r ? `✅ ${name}: "${r.slice(0, 70)}…"` : `❌ ${name}: נפתח בלי טקסט`);
  await p.keyboard.press("Escape").catch(() => {});
};

// 1 · מסביר הבידינג (בתוך אקורדיון סגור)
await p.goto(`${BASE}/he/planner`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);
const opened = await p.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((el) => /איך עובד הבידינג/.test(el.innerText));
  if (!btn) return false;
  btn.click();
  return true;
});
console.log("אקורדיון הבידינג נפתח:", opened);
if (opened) await check("מסביר הבידינג");

// 2 · תכנון מבחנים — הכפתורים תלויים בתוכנית שמורה
await p.goto(`${BASE}/he/exam-planner`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);
const txt = await p.evaluate(() => document.body.innerText.slice(0, 900));
console.log("\n— מצב מסך תכנון המבחנים —\n" + txt);
await shot(p, "V69-exam-planner");
const n = await p.evaluate(() => document.querySelectorAll('button[aria-label*="שאל"]').length);
console.log("כפתורי שאלה במסך:", n);
if (n) await check("תכנון מבחנים");
await b.close();
