// A9 — בדיוק השאלה של אריאל, ובדיקה שהתשובה לא ממציאה מספרים.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
await p.goto(`${BASE}/he/record`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);

const Q = 'יש לי 5 המרות בינארי. הכי משתלם להמיר את "אסטרטגיה בעידן המודרני + תרגול" (ציון 90) — הממוצע יעלה ל-96.8. מה כדאי לשקול לפני שאני מחליט?';

// פותחים, מסלקים היכרות אם יש, פותחים שוב עם השאלה
const open = async (prompt = "") =>
  p.evaluate((q) => window.dispatchEvent(new CustomEvent("pk:ask", { detail: { prompt: q } })), prompt);
await open();
await p.waitForTimeout(1500);
const dismissed = await p.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((e) => /הבנתי, בואו נתחיל/.test(e.innerText));
  if (btn) { btn.click(); return true; } return false;
});
console.log("היכרות נסגרה:", dismissed);
await p.waitForTimeout(1200);
await open(Q);
await p.waitForTimeout(2500);

const box = p.locator('input[aria-label^="שאלה אל"]');
if ((await box.count()) === 0) { console.log("❌ תיבת הכתיבה לא נמצאה"); await shot(p, "V69-A9-nobox"); await b.close(); process.exit(0); }
const before = await box.inputValue();
console.log("הטקסט שבתיבה:", JSON.stringify(before.slice(0, 60) + "…"));
await box.click();
if (!before.trim()) await box.fill(Q);
await p.keyboard.press("Enter");
console.log("נשלח, ממתין…");
await p.waitForFunction(() => /המרה|בינאר|ממוצע/.test(document.body.innerText.slice(-4000)), null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(20000);
await shot(p, "V69-A9-king-binary");
const txt = await p.evaluate(() => document.body.innerText);
const i = txt.indexOf("5 המרות בינארי");
console.log("\n=== התכתובת ===\n" + (i < 0 ? txt.slice(-3000) : txt.slice(i, i + 3000)));
console.log("\n=== שגיאות ===", errors.slice(0, 5).join("\n") || "אין");
await b.close();
