// ============================================================
// מנוע הסיור — פעולה־פעולה, עם הוכחה לכל אחת
// ------------------------------------------------------------
// אריאל, G7: *"בדיקה חיה כמשתמש של כל פיצ׳ר, כל טאב, כל שלב,
// כשנה א׳/ב׳/ג׳, עם צילומי מסך"*.
//
// למה מנוע ולא סקריפט ארוך: הסיור הוא שעות, והסשן יכול להיקטע. כל
// פעולה נכתבת לדיסק **מיד** כשהיא נגמרת, כך שהפסקה עולה פעולה אחת
// לכל היותר. הרצה חוזרת מדלגת על מה שכבר עבר, אלא אם מבקשים אחרת.
//
//   node video/tour-runner.mjs --persona y2 [--mobile] [--only id1,id2] [--redo]
//
// כל פעולה מחזירה { ok, note, evidence } — ו-`evidence` היא **הנתון
// שהשתנה**, לא הצהרה. "לחצתי" אינה הוכחה; "לפני 21, אחרי 24" כן.
// ============================================================
import { openApp, login, shot, measure, BASE } from "./tour-lib.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESULTS = fileURLToPath(new URL("../docs/סיור-תוצאות.json", import.meta.url));
const arg = (f, d) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const PERSONA = arg("--persona", "y2");
const MOBILE = process.argv.includes("--mobile");
const REDO = process.argv.includes("--redo");
const ONLY = (arg("--only", "") || "").split(",").filter(Boolean);
const KEY = `${PERSONA}-${MOBILE ? "mobile" : "desktop"}`;

const load = () => (existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf-8")) : {});
const save = (all) => writeFileSync(RESULTS, JSON.stringify(all, null, 1), "utf-8");

export async function runTour(actions) {
  const all = load();
  all[KEY] ??= {};
  const { b, p, errors } = await openApp(
    MOBILE ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 1100 },
  );

  const ctx = {
    p, errors, MOBILE, BASE, KEY,
    settle: async (ms = 3500) => {
      await p.waitForTimeout(ms);
      await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {});
    },
    txt: async () => (await p.locator("body").innerText()).replace(/\s+/g, " ").trim(),
    go: async (path, ms = 5000) => {
      await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await ctx.settle(ms);
      await ctx.dismissModals();
    },
    /**
     * סוגר חלון מודאלי פתוח.
     *
     * 4.9: הסיור דיווח "נלחץ" על כפתור ה-ICS ושום קובץ לא ירד. הסיבה
     * הייתה `dialog-overlay` שחוסם את הלחיצה — החלון "מה שצריך לדעת על
     * פכ״מ", שנפתח **פעם אחת למכשיר** ולכן נפתח בכל הרצה של הסיור, כי
     * הדפדפן נולד מחדש עם localStorage ריק. זו התנהגות נכונה של המוצר
     * והתנהגות שגויה של הכלי.
     *
     * ומה שהסתיר את זה: `.click().catch(() => {})` בלע את השגיאה, אז
     * הסיור **דיווח הצלחה על פעולה שלא קרתה**. זו אותה משפחה של הבדיקה
     * ש-`if (slider)` דילגה עליה בשקט.
     */
    dismissModals: async () => {
      for (let i = 0; i < 3; i++) {
        const overlay = await p.locator("[data-slot=dialog-overlay]").count();
        if (!overlay) return;
        const close = p.getByRole("button", { name: /^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/ }).first();
        if (await close.count()) await close.click().catch(() => {});
        else await p.keyboard.press("Escape");
        await p.waitForTimeout(900);
      }
    },
    shot: (name) => shot(p, `${KEY}-${name}`),
    /** כמה פעמים מחרוזת מופיעה — הדרך הפשוטה למדוד "השתנה" */
    count: async (re) => ((await ctx.txt()).match(re) || []).length,
    /** ערך מספרי מהמסך, למדידת לפני/אחרי */
    num: async (re) => { const m = (await ctx.txt()).match(re); return m ? Number(m[1]) : null; },
  };

  console.log(`\n═══ סיור · ${KEY} ═══`);
  await login(p);
  await ctx.settle(6000);

  let pass = 0, fail = 0, skip = 0;
  for (const a of actions) {
    if (ONLY.length && !ONLY.includes(a.id)) continue;
    if (!REDO && all[KEY][a.id]?.ok) { skip += 1; continue; }
    const t0 = Date.now();
    let r;
    try {
      r = await a.run(ctx);
    } catch (e) {
      r = { ok: false, note: `חריגה: ${String(e).slice(0, 160)}` };
    }
    r.secs = +((Date.now() - t0) / 1000).toFixed(1);
    r.at = new Date().toISOString();
    if (errors.length) { r.js = [...new Set(errors)].slice(0, 3); errors.length = 0; }
    all[KEY][a.id] = { name: a.name, ...r };
    save(all);                                   // ← אחרי כל פעולה, לא בסוף
    r.ok ? pass++ : fail++;
    console.log(`${r.ok ? "✅" : "❌"} ${a.id.padEnd(22)} ${a.name}`);
    if (r.note) console.log(`     ${r.note}`);
    if (r.evidence) console.log(`     הוכחה: ${r.evidence}`);
    if (r.js) console.log(`     ✗ JS: ${r.js.join(" | ")}`);
  }

  console.log(`\n── ${KEY}: ${pass} עברו · ${fail} נכשלו · ${skip} דולגו ──`);
  await b.close();
  return { pass, fail, skip };
}

export { measure };
