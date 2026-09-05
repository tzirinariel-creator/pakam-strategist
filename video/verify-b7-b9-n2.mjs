// ============================================================
// B7 · B9 · N2 — הבאג שאריאל קרא לו "פאדיחה ענקית"
// ------------------------------------------------------------
// *"לחצתי על הלחצן שאמור לקחת אותי לתכנון שנתי לבידינג והוא מחק לי
//  נתונים ואמר לי שאנחנו נתכנן את שנה א׳"*
// *"חזרתי ופתאום בום — זה חזר לתכנון של סמסטר א׳ שנה א׳ ואז כל המערכת
//  התאפסה ופתאום האפליקציה אמרה לי שעשיתי רק 5 אחוז מהתואר"*
//
// שלושתם מסומנים "קוד בלבד" — כלומר לא הוכח חי שהם תוקנו. עד עכשיו.
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { writeFileSync } from "node:fs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const T = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const go = async (u, ms = 8000) => {
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 900, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(ms);
};
const snap = async () => {
  const t = await T();
  return {
    year:    (t.match(/שנה [א-ג]׳/) || ["?"])[0],
    pct:     (t.match(/(\d+)% מהתואר|מהתואר הושלמו/) || t.match(/(\d+)%/) || ["?"])[0],
    credits: (t.match(/(\d+) ?\/ ?150/) || ["?"])[0],
    done:    (t.match(/(\d+) הושלמו/) || ["?"])[0],
    planned: (t.match(/(\d+) מתוכננים/) || ["?"])[0],
  };
};
const log = [];
try {
  await login(p);
  await go("/he/planner", 9000);
  const before = await snap();
  await shot(p, "B7-01-לפני");
  console.log("לפני :", JSON.stringify(before, null, 0));

  // הכפתור שאריאל תיאר — "תכננו את שני הסמסטרים לבידינג"
  const btn = p.locator("main a, main button").filter({ hasText: /תכננו את שני הסמסטרים|לבידינג/ }).first();
  if (!(await btn.count())) { console.log("❌ לא נמצא הכפתור לבידינג"); throw new Error("no button"); }
  const label = (await btn.innerText()).trim().split("\n")[0];
  await btn.click();
  await p.waitForTimeout(7000);
  const mid = await snap();
  await shot(p, "B7-02-אחרי-לחיצה");
  console.log(`אחרי "${label}":`, JSON.stringify(mid, null, 0), "·", p.url().replace(BASE, ""));

  // ★ חזרה — הרגע שבו אריאל ראה את האיפוס
  await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForFunction(() => document.body.innerText.length > 900, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(8000);
  const after = await snap();
  await shot(p, "B7-03-אחרי-חזרה");
  console.log("אחרי חזרה:", JSON.stringify(after, null, 0));

  // ורענון מלא, כדי לוודא שהשרת מסכים
  await go("/he/planner", 9000);
  const fresh = await snap();
  await shot(p, "B7-04-אחרי-רענון");
  console.log("אחרי רענון:", JSON.stringify(fresh, null, 0));

  const same = (a, c) => a.year === c.year && a.credits === c.credits && a.done === c.done;
  const ok = same(before, after) && same(before, fresh);
  console.log(`\n${ok ? "✅ שום דבר לא אופס — הנתונים, השנה והאחוז זהים" : "‼️ משהו השתנה — הבאג חי"}`);
  log.push({ before, mid, after, fresh, ok, label });
  writeFileSync("docs/אימות-B7-B9-N2.json", JSON.stringify(log, null, 1), "utf-8");
  console.log("שגיאות JS:", [...new Set(errors)].filter(e => !/ResizeObserver/.test(e)).slice(0, 2).join(" | ") || "אין");
} finally { await b.close(); }
