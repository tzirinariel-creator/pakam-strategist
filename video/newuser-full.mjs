// ============================================================
// המשתמש החדש — הזרימה המלאה בריצה אחת, מאפס עד הבידינג
// ------------------------------------------------------------
// אריאל: *"בדיקה היא רק בדיקה בלייב, עם צילום מסך, כמשתמש."*
// הולך לפי מה שעל המסך ולא לפי תסריט קשיח — האשף הוא מכונת־מצבים,
// וכל ניסיון להכתיב לו סדר נשבר.
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const SHEET = fileURLToPath(new URL("./fixtures/sheet-year2.png", import.meta.url));
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const M = async () => (await p.locator("main").innerText().catch(() => p.locator("body").innerText())).replace(/\s+/g, " ");
const log = [];
const rec = async (name, note) => {
  const f = (await shot(p, `NF-${name}`)).split("/").pop();
  log.push({ name, note: String(note).slice(0, 240), shot: f });
  writeFileSync("docs/משתמש-חדש-מלא.json", JSON.stringify(log, null, 1), "utf-8");
  console.log(`📸 ${name.padEnd(24)} ${String(note).slice(0, 100)}`);
};
const has = async (re) => re.test(await M());
const tap = async (re, ms = 4500) => {
  const e = p.getByRole("button", { name: re }).first();
  if (!(await e.count())) return false;
  try { await e.click({ timeout: 9000 }); } catch { return false; }
  await p.waitForTimeout(ms); return true;
};
try {
  await login(p); await p.waitForTimeout(4000);
  await rec("01-נחיתה", p.url().replace(BASE, "") + " · " + (await M()).slice(0, 90));

  for (let turn = 1; turn <= 14; turn++) {
    const t = await M();
    if (/בואו נתחיל/.test(t))                 { await tap(/^בואו נתחיל$/); continue; }
    if (/איפה אתם בתואר/.test(t)) {
      await rec("02-נקודת-פתיחה", "שלוש אפשרויות, כולל 'הגיליון לא זמין — נמלא ידנית'");
      await tap(/כבר יש לכם ש/); continue;
    }
    if (/העלו את גיליון|בחרו קובץ/.test(t)) {
      await rec("03-מסך-הגיליון", (t.match(/העלו את גיליון[^.]{0,70}/) || ["—"])[0]);
      await p.locator('input[type="file"]').first().setInputFiles(SHEET);
      await p.waitForFunction(() => /קראנו|לא הצלחנו|נכשל|לא מצאנו/.test(document.body.innerText),
                              null, { timeout: 180000 }).catch(() => {});
      await p.waitForTimeout(5000); continue;
    }
    if (/קראנו \d+ קורסים|זה מה שקראנו/.test(t)) {
      await rec("04-מה-שנקרא", (t.match(/קראנו \d+ קורסים[^.]{0,80}/) || ["—"])[0]);
      await tap(/^נכון — המשיכו מכאן$/, 6000) || await tap(/^הבא$/, 6000); continue;
    }
    if (/סיום ושמירה/.test(t)) {
      await rec("07-לפני-שמירה", t.slice(0, 160));
      await tap(/^סיום ושמירה$/, 3000);
      await p.waitForFunction(() => /הכול מוכן/.test(document.body.innerText), null, { timeout: 160000 }).catch(() => {});
      await p.waitForTimeout(4000);
      await rec("08-הכול-מוכן", (await M()).match(/הכול מוכן[^.]{0,90}/)?.[0] ?? "—");
      await p.waitForTimeout(12000);
      const holds = /הכול מוכן/.test(await M());
      console.log(`   ★ מסך הסיום אחרי 12 שניות: ${holds ? "✅ מחזיק" : "❌ קפץ מעצמו"}`);
      log.push({ name: "★ יציבות-מסך-הסיום", holds });
      await tap(/לדף הבית/, 9000);
      await rec("09-דף-הבית-הראשון", (await M()).slice(0, 200));
      break;
    }
    if (/^\s*$/.test(t)) { await p.waitForTimeout(3000); continue; }
    // שלב ביניים כלשהו — מצלמים וממשיכים
    await rec(`0${Math.min(turn,9)}-שלב-${turn}`, t.slice(0, 130));
    if (!(await tap(/^הבא$/, 5000)) && !(await tap(/^המשיכו$/, 5000))) {
      console.log("   ⏹ אין כפתור המשך — עוצר כאן");
      break;
    }
  }
  console.log("\nשגיאות JS:", [...new Set(errors)].filter(e => !/ResizeObserver/.test(e)).slice(0, 2).join(" | ") || "אין");
} finally { await b.close(); }
