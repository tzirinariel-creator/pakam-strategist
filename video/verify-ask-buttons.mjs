// ============================================================
// כל כפתור "שאלו את המלך" — נלחץ, ונבדק שהוא באמת פתח שאלה
// ============================================================
// אריאל, 5.9: *"אתה צריך לראות שכל פעם שיש לחצן שמוביל לשאלה אליו — זה עובד
// מעולה, כי אחרת זה סתם פוגע באמון של המשתמש בלחצנים."*
//
// הכפתור משדר CustomEvent בשם pk:ask, ו-FloatingAssistant מאזין לו: פותח
// את הפאנל וממלא את תיבת הקלט. לכן "עובד" = הפאנל נפתח **וגם** יש טקסט
// בתיבה. פאנל שנפתח ריק הוא בדיוק הכישלון השקט.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";

const PAGES = [
  ["/he/dashboard", "בית"],
  ["/he/record", "התיק האקדמי"],
  ["/he/regulations", "דרישות התואר"],
  ["/he/catalog", "קטלוג"],
  ["/he/exam-planner", "תכנון מבחנים"],
  ["/he/planner", "תכנון התואר"],
  ["/he/graduation", "מחשבון ציון גמר"],
  ["/he/bidding", "בידינג"],
];

const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

let total = 0, ok = 0;
const failures = [];

for (const [path, label] of PAGES) {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 500, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(3500);

  const n = await p.evaluate(() =>
    document.querySelectorAll('button[aria-label*="שאל"],button[aria-label*="שאלו"],button[aria-label*="שאלי"]').length);
  if (n === 0) { console.log(`⚠️  ${label.padEnd(16)} — אין כפתורי שאלה בעמוד הזה`); continue; }
  console.log(`— ${label}: ${n} כפתורים, דוגמים 4 —`);

  const cap = Math.min(n, 4); // ארבע דגימות לעמוד — בקטלוג יש כפתור לכל קורס
  for (let i = 0; i < cap; i++) {
    total++;
    // סוגרים פאנל פתוח ומנקים, כדי שכל לחיצה תיבדק על מצב נקי
    await p.evaluate(() => {
      const ta = document.querySelector('textarea,input[type="text"][placeholder*="שאל"]');
      if (ta) (ta).value = "";
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(400);

    const info = await p.evaluate((idx) => {
      const btns = [...document.querySelectorAll('button[aria-label*="שאל"],button[aria-label*="שאלו"],button[aria-label*="שאלי"]')];
      const el = btns[idx];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      el.scrollIntoView({ block: "center" });
      return { label: el.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) };
    }, i);
    if (!info) { failures.push(`${label} #${i}: הכפתור נעלם`); continue; }
    await p.waitForTimeout(250);

    await p.evaluate((idx) => {
      const btns = [...document.querySelectorAll('button[aria-label*="שאל"],button[aria-label*="שאלו"],button[aria-label*="שאלי"]')];
      btns[idx]?.click();
    }, i);
    await p.waitForTimeout(1400);

    const res = await p.evaluate(() => {
      const fields = [...document.querySelectorAll("textarea,input")];
      const filled = fields.map((f) => (f).value || "").filter((v) => v.trim().length > 8);
      return { opened: document.body.innerText.includes("כתוב שאלה") || filled.length > 0, prompt: filled[0] ?? null };
    });
    if (res.opened && res.prompt) {
      ok++;
      console.log(`✅ ${label.padEnd(16)} "${info.label}" → "${res.prompt.slice(0, 60)}…"`);
    } else {
      failures.push(`${label} · "${info.label}" · ${info.w}×${info.h} · נפתח=${res.opened} · טקסט=${JSON.stringify(res.prompt)}`);
      console.log(`❌ ${label.padEnd(16)} "${info.label}" — נפתח=${res.opened} טקסט=${res.prompt ? "יש" : "אין"}`);
      await shot(p, `ask-fail-${label.replace(/\s/g, "-")}-${i}`);
    }
  }
}

console.log(`\n═══ ${ok}/${total} כפתורי שאלה עובדים ═══`);
if (failures.length) { console.log("\nכשלים:"); for (const f of failures) console.log(" ·", f); }
if (errors.length) console.log("\nשגיאות JS:", errors.slice(0, 6).join("\n"));
await b.close();
