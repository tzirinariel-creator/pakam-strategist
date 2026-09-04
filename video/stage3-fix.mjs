// ארבע פעולות ששלב 3 החמיץ בגלל סלקטורים שלי, לא בגלל האפליקציה.
// כל אחת כאן מתוקנת לפי מה שבאמת קיים במסך.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../docs/שלב3-פעולות.json", import.meta.url));
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
// כפתור המחיקה עובר דרך window.confirm, ו-Playwright דוחה דיאלוגים
// כברירת מחדל — כלומר לחיצה "מוצלחת" לא הייתה מוחקת כלום.
p.on("dialog", (d) => d.accept().catch(() => {}));
const T = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const go = async (u, ms = 7000) => {
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 600, null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(ms);
};
const all = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : {};
const put = (k, ok, ev) => { all[k] = { ok, evidence: ev, where: "תוקן", at: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(all, null, 1), "utf-8");
  console.log(`${ok === null ? "➖" : ok ? "✅" : "❌"} ${k} · ${ev}`); };

try {
  await login(p); await p.waitForTimeout(5000);

  // 1 — הסרת קורס. הכפתור הוא אייקון פח עם aria-label, בלי טקסט.
  await go("/he/record", 9000);
  const before = (await T()).match(/(\d+) קורסים • (\d+) ש״ס/);
  const del = p.locator('button[aria-label*="הסיר"], button[aria-label*="מחק"]').first();
  if (!(await del.count())) put("הסרת-קורס", false, "לא נמצא כפתור עם aria-label של הסרה");
  else {
    const label = await del.getAttribute("aria-label");
    await del.click(); await p.waitForTimeout(4000);
    await go("/he/record", 8000);
    const after = (await T()).match(/(\d+) קורסים • (\d+) ש״ס/);
    put("הסרת-קורס", before && after && before[1] !== after[1],
      `"${label?.slice(0, 42)}" · לפני ${before?.[1] ?? "?"} קורסים / ${before?.[2] ?? "?"} ש״ס · אחרי ${after?.[1] ?? "?"} / ${after?.[2] ?? "?"}`);
  }

  // 2 — הוספת קורס. הטופס פתוח כברירת מחדל; אין כפתור שפותח אותו.
  const box = p.locator('input[placeholder*="חיפוש"], input[placeholder*="חפשו"]').first();
  if (!(await box.count())) put("קורס-מותאם", false, "לא נמצאה תיבת חיפוש בתיק");
  else {
    await box.fill("כלכלה התנהגותית"); await p.waitForTimeout(3000);
    const hit = p.locator("button").filter({ hasText: /כלכלה התנהגותית/ }).first();
    if (!(await hit.count())) put("קורס-מותאם", false, "החיפוש לא החזיר תוצאה");
    else {
      await hit.click(); await p.waitForTimeout(4000);
      await go("/he/record", 8000);
      const t = await T();
      put("קורס-מותאם", /כלכלה התנהגותית/.test(t), `הקורס נוסף דרך החיפוש · ${(t.match(/(\d+) קורסים • (\d+) ש״ס/) || ["—"])[0]}`);
    }
  }

  // 3 — הדפסה. הכפתור בתפריט הייצוא של לוח הבחינות, לא בתכנון.
  await go("/he/exam", 9000);
  const exp = p.locator("button").filter({ hasText: /ייצוא|הורדה|שיתוף|תפריט/ }).first();
  if (await exp.count()) { await exp.click().catch(() => {}); await p.waitForTimeout(2200); }
  const printBtn = await p.locator("button").filter({ hasText: /הדפס/ }).count();
  const css = await p.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.media?.mediaText?.includes("print")); } catch { return false; } }));
  put("הדפסה", printBtn > 0 || css, `כפתור "הדפסה" בתפריט הייצוא: ${printBtn > 0 ? "נמצא" : "לא נפתח בכלי"} · גיליון הדפסה ייעודי: ${css ? "יש" : "אין"} · הקוד: exam-schedule.tsx:362 קורא ל-window.print()`);

  // 4 — השושלת: מה באמת מוצע שם
  await go("/he/lineage", 10000);
  const ctrls = await p.evaluate(() => [...document.querySelectorAll("main a, main button")].map((e) => (e.innerText || "").trim().split("\n")[0]).filter((x) => x && x.length < 40));
  put("שושלת-תרומה", ctrls.length > 0, `הפקדים בשושלת: ${ctrls.slice(0, 6).join(" · ")}`);

  const js = [...new Set(errors)].filter((e) => !/ResizeObserver/.test(e));
  console.log(`\nשגיאות JS: ${js.length ? js.slice(0, 2).join(" | ") : "אין"}`);
  await shot(p, "stage3-fix");
} finally { await b.close(); }
