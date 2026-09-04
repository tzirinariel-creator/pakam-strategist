// ============================================================
// המילואימניק — שנה ג׳, עם מילואים בשנה א׳ ובשנה ב׳
// ------------------------------------------------------------
// אריאל, 5.9: *"תחקור על המענה שלנו לזה."*
//
// השאלה: `deriveCurrentGroup` מחפש שורה לסמסטר הנוכחי. לסטודנט הזה אין
// מילואים בשנה ג׳ — אז מה קורה לזכאויות שצבר בשנים א׳–ב׳?
//
// הפרסונה נבנית **דרך הממשק בלבד**. ב-4.9 זריקה ישירה למסד דילגה על
// deriveGroupFromDays והולידה "באג" שלא היה קיים.
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { writeFileSync } from "node:fs";

const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const M = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ");
const go = async (u, ms = 8000) => {
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 900, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(ms);
};
const out = {};
try {
  await login(p); await p.waitForTimeout(6000);
  await go("/he/miluim", 9000);
  out.לפני = (await M()).slice(0, 220);
  console.log("לפני ההזנה:", out.לפני.slice(0, 150));

  // שתי שורות: תשפ״ה = שנה א׳ · תשפ״ו = שנה ב׳ (הסטודנט התחיל בתשפ״ה).
  // השנה והסמסטר הם קבוצות כפתורים, לא רשימות — לוחצים, לא בוחרים.
  const SPEC = [{ year: "תשפ״ה", sem: "א׳", days: 40 },
                { year: "תשפ״ו", sem: "א׳", days: 25 }];
  for (let i = 0; i < SPEC.length; i++) {
    const add = p.getByRole("button", { name: /הוסיפו סמסטר/ }).first();
    if (!(await add.count())) break;
    await add.click(); await p.waitForTimeout(2500);
    // השורה החדשה היא האחרונה; מגבילים את הבחירה אליה
    const rows = p.locator('main input[type="number"]');
    const idx = (await rows.count()) - 1;
    const row = rows.nth(idx).locator("xpath=ancestor::*[self::div][3]");
    const yBtn = row.getByRole("button", { name: new RegExp(`^${SPEC[i].year}$`) }).first();
    if (await yBtn.count()) { await yBtn.click(); await p.waitForTimeout(700); }
    else console.log(`  ⚠️  לא נמצא כפתור שנה ${SPEC[i].year} בשורה`);
    const sBtn = row.getByRole("button", { name: new RegExp(`^${SPEC[i].sem}$`) }).first();
    if (await sBtn.count()) { await sBtn.click(); await p.waitForTimeout(700); }
    await rows.nth(idx).fill(String(SPEC[i].days)).catch(() => {});
    await p.waitForTimeout(800);
    console.log(`  שורה ${i + 1}: ${SPEC[i].year} · סמסטר ${SPEC[i].sem} · ${SPEC[i].days} ימים`);
  }
  const save = p.getByRole("button", { name: /שמירת מילואים/ }).first();
  if (await save.count()) { await save.click(); await p.waitForTimeout(7000); }

  await go("/he/miluim", 10000);
  const t = await M();
  out.אחרי = t;
  const grab = (re) => { const m = t.match(re); return m ? m[0].trim() : "—"; };
  console.log("\n═══ מה המילואימניק רואה ═══");
  console.log("שורות סמסטר :", (t.match(/שנה [א-ג]׳[^·|]{0,40}(ימים|קבוצה)[^·|]{0,24}/g) || ["—"]).join(" | ").slice(0, 200));
  console.log("פטור ש״ס    :", grab(/פטור ש״ס — מצטבר לכל התואר[^]{0,150}/).slice(0, 170));
  console.log("בינארי      :", grab(/המרות בינארי — מצטבר לכל התואר[^]{0,120}/).slice(0, 140));
  console.log("קבוצה נוכחית:", grab(/הקבוצה שלכם[^.]{0,110}|לקבוצה הנוכחית[^.]{0,110}/).slice(0, 140));
  await shot(p, "miluim-y3-reservist");

  for (const [u, label] of [["/he/record", "התיק"], ["/he/exam-planner", "תכנון מבחנים"], ["/he/graduation", "ציון גמר"]]) {
    await go(u, 9000);
    const x = await M();
    out[label] = x.slice(0, 400);
    const mil = x.match(/[^.]{0,70}(מילואים|בינאר|מועד ב)[^.]{0,90}/);
    console.log(`\n${label}: ${mil ? mil[0].trim().slice(0, 160) : "אין אזכור מילואים"}`);
    await shot(p, `miluim-y3-${label}`);
  }
  writeFileSync("docs/מילואימניק-שנה-ג.json", JSON.stringify(out, null, 1), "utf-8");
  console.log("\nשגיאות JS:", [...new Set(errors)].filter(e => !/ResizeObserver/.test(e)).slice(0, 2).join(" | ") || "אין");
} finally { await b.close(); }
