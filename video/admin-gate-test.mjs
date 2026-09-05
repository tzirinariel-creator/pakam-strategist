// השער — מה קורה למי שאינו מנהל, ולמי שלא מחובר בכלל.
import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1280, height: 900 });

// 1 · לא מחובר בכלל
await p.goto(`${BASE}/he/admin`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
console.log("לא מחובר →", p.url().replace(BASE, ""));

// 2 · מחובר כמשתמש רגיל (הדמו) — לא מנהל
await login(p, process.env.NEXT_PUBLIC_DEMO_USER_EMAIL, process.env.DEMO_USER_PASSWORD);
await p.goto(`${BASE}/he/admin`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(5000);
console.log("משתמש רגיל →", p.url().replace(BASE, ""));
const leaked = await p.evaluate(() => document.body.innerText.includes("לוח הבקרה") || document.body.innerText.includes("משפך ההפעלה"));
console.log("דלף תוכן ניהולי:", leaked ? "❌ כן" : "✅ לא");

// 3 · והנתונים עצמם — adminProcedure מחזיר 403?
const res = await p.evaluate(async () => {
  const r = await fetch(`/api/trpc/admin.getOverview?batch=1&input=${encodeURIComponent(JSON.stringify({0:{json:null,meta:{values:["undefined"]}}}))}`);
  const t = await r.text();
  return { status: r.status, body: t.slice(0, 220) };
});
console.log("admin.getOverview למשתמש רגיל:", res.status, res.body);

// 4 · גם סרגל הצד לא מציע את המסך
await p.goto(`${BASE}/he/dashboard`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(5000);
const inNav = await p.evaluate(() => document.body.innerText.includes("לוח הבקרה"));
console.log("הקישור בסרגל למשתמש רגיל:", inNav ? "❌ מופיע" : "✅ לא מופיע");
await b.close();
