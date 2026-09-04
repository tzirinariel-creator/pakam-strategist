// בונה תוכנית מבחנים דרך האשף, כדי לראות את M54 ו-M44 חיים
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1200 });
const settle = async (ms = 4000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 40000 }).catch(() => {}); };
const btns = async () => p.evaluate(() => [...document.querySelectorAll("button")]
  .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean));
await login(p); await settle();
await p.goto(`${BASE}/he/exam-planner`, { waitUntil: "networkidle" }); await settle(6000);

// שלב 1 — לבחור את כל המבחנים (התיבה היא כפתור עם aria-label "הוסיפו את …")
const adds = p.locator('button[aria-label^="הוסיפו את"]');
const n = await adds.count();
console.log(`תיבות בחירה: ${n}`);
for (let i = 0; i < n; i++) { await adds.nth(0).click({ force: true }).catch(() => {}); await p.waitForTimeout(600); }
await p.waitForTimeout(1500);
console.log("נבחרו:", ((await p.locator("body").innerText()).match(/(\d+) נבחרו/) || [])[0] || "?");

for (let step = 0; step < 6; step++) {
  const labels = await btns();
  const next = labels.find((l) => /^(בנה לי תוכנית לימוד|הבא)/.test(l));
  console.log(`שלב ${step}: ${next ? `→ «${next}»` : "אין כפתור המשך · " + labels.slice(0, 12).join(" · ")}`);
  if (!next) break;
  await p.getByRole("button", { name: new RegExp("^" + next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).first().click().catch(() => {});
  await settle(5000);
  const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  if (/הלוח השבועי שלכם|אג׳נדה|האג'נדה|מטלות/.test(t)) { console.log("   ✅ התוכנית נבנתה"); break; }
}
await settle(6000);
console.log("צילום:", await shot(p, "examplan-built", { full: true }));
const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("\nמסך:", t.slice(0, 1200));
console.log("\nשגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
