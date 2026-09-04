// הפעולות שנשארו ⬜ ואפשר לאמת אותן חי: גרירה בין סמסטרים, גרירה בטלפון,
// תרומה לשושלת ומשיכתה, והספינר שנעלם לפני שהעמוד נטען.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../docs/שלב3-פעולות.json", import.meta.url));
const W = +(process.argv.includes("--width") ? process.argv[process.argv.indexOf("--width")+1] : 1440);
const { b, p, errors } = await openApp({ width: W, height: W < 700 ? 844 : 1100 });
const T = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const go = async (u, ms = 7000) => {
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 600, null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(ms);
};
const all = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : {};
const put = (k, ok, ev) => { all[k] = { ok, evidence: ev, width: W, at: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(all, null, 1), "utf-8");
  console.log(`${ok === null ? "➖" : ok ? "✅" : "❌"} ${k} · ${ev}`); };

try {
  await login(p); await p.waitForTimeout(5000);

  // J2 — הספינר. נמדד בזמן טעינה: האם יש מחוון בזמן שהתוכן עוד לא שם.
  {
    await p.goto(`${BASE}/he/planner`, { waitUntil: "commit" });
    let sawSpinner = false, sawEmptyNoSpinner = false;
    for (let i = 0; i < 40; i++) {
      const st = await p.evaluate(() => ({
        spin: !!document.querySelector("[class*=animate-pulse], [class*=animate-spin], [role=status]"),
        len: document.body.innerText.replace(/\s+/g, " ").length,
      })).catch(() => null);
      if (!st) { await p.waitForTimeout(250); continue; }
      if (st.spin) sawSpinner = true;
      if (!st.spin && st.len < 700) sawEmptyNoSpinner = true;
      if (st.len > 1500 && !st.spin) break;
      await p.waitForTimeout(250);
    }
    put("ספינר-טעינה", sawSpinner && !sawEmptyNoSpinner,
      `מחוון טעינה נראה: ${sawSpinner ? "כן" : "לא"} · חלון של עמוד ריק בלי מחוון: ${sawEmptyNoSpinner ? "‼️ כן" : "לא"}`);
  }

  // F4 / J3 — גרירת קורס בין סמסטרים, ברצף עכבר אמיתי (HTML5 dnd)
  await go("/he/planner", 9000);
  const cards = p.locator('[draggable="true"], [data-dnd-draggable], [role="button"][aria-roledescription]');
  const n = await cards.count();
  if (!n) put(W < 700 ? "גרירה-בטלפון" : "גרירה-בין-סמסטרים", false, "לא נמצא אלמנט הניתן לגרירה");
  else {
    const src = cards.first();
    const box = await src.boundingBox();
    const before = (await T()).match(/סמסטר א׳ (\d+) ש״ס|(\d+) ש״ס/);
    // יעד: הכרטיס של סמסטר ב׳
    const dst = p.locator("text=/סמסטר ריק|גררו קורסים לכאן/").first();
    const dbox = (await dst.count()) ? await dst.boundingBox() : null;
    if (box && dbox) {
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await p.mouse.move(box.x + (dbox.x - box.x) * i / 12 + box.width / 2,
                           box.y + (dbox.y - box.y) * i / 12 + box.height / 2);
        await p.waitForTimeout(90);
      }
      await p.mouse.up();
      await p.waitForTimeout(4000);
      const after = await T();
      const moved = !/סמסטר ריק — גררו קורסים לכאן/.test(after.split("סמסטר ב׳")[1]?.slice(0, 200) ?? "");
      put(W < 700 ? "גרירה-בטלפון" : "גרירה-בין-סמסטרים", moved,
        moved ? "הקורס עבר לסמסטר ב׳ (הכרטיס הריק נעלם)" : "הגרירה בוצעה אך סמסטר ב׳ נשאר ריק");
      await shot(p, `drag-${W}`);
    } else put(W < 700 ? "גרירה-בטלפון" : "גרירה-בין-סמסטרים", false,
      `נמצאו ${n} אלמנטים לגרירה, אך לא אותר יעד "סמסטר ריק"`);
  }

  // F26 / F27 — תרומה לשושלת ומשיכתה
  await go("/he/lineage", 10000);
  const give = p.locator("main a, main button").filter({ hasText: /לדירוג|כתבו|תרמו|שתפו/ }).first();
  if (!(await give.count())) put("שושלת-תרומה-בפועל", false, "לא נמצא פקד תרומה");
  else {
    const label = (await give.innerText()).trim().split("\n")[0];
    await give.click().catch(() => {});
    await p.waitForTimeout(4500);
    const t = await T();
    const form = /דירוג|כמה|ציון|קושי|עומס|שלחו|שמרו/.test(t);
    put("שושלת-תרומה-בפועל", form, `נלחץ "${label}" · ${form ? "נפתח טופס תרומה" : "לא נפתח טופס"} · ${t.slice(0, 90)}`);
    const undo = p.locator("button").filter({ hasText: /משכו|בטלו|מחקו את התרומה/ }).first();
    put("משיכת-תרומה", (await undo.count()) > 0,
      (await undo.count()) ? "קיים פקד למשיכת התרומה" : "לא נמצא פקד משיכה במצב הזה (אין עדיין תרומה לחשבון)");
  }
  console.log(`\nשגיאות JS: ${[...new Set(errors)].filter(e=>!/ResizeObserver/.test(e)).slice(0,2).join(" | ") || "אין"}`);
} finally { await b.close(); }
