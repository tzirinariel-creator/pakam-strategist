// ============================================================
// פרסונה 1 — סטודנט שנה א׳ שמתחיל מאפס
// ------------------------------------------------------------
// משרת גם את U6 (אורי: "מה חובה ומה בחירה") ואת W2 (מסך בחירת התוכנית),
// וגם את שלב 3 בתוכנית — הסיור המלא.
// הרצה:  npm run reset:test && node video/persona-year1.mjs [--mobile]
// ============================================================
import { openApp, login, shot, measure, report, BASE } from "./tour-lib.mjs";

const MOBILE = process.argv.includes("--mobile");
const { b, p, errors } = await openApp(MOBILE ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 1100 });
const tag = MOBILE ? "M" : "D";
const settle = async (ms = 4000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 45000 }).catch(() => {}); };
const txt = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const ready = async (re, ms = 90000) => { try { await p.waitForFunction((x) => !document.querySelector("[class*=animate-pulse]") && new RegExp(x).test(document.body.innerText), re.source, { timeout: ms }); return true; } catch { return false; } };
const res = [];
const check = (id, ok, d) => { res.push([id, ok]); console.log(`${ok ? "✅" : "❌"} ${id} — ${d}`); };

console.log(`═══ פרסונה שנה א׳ · ${MOBILE ? "נייד 390px" : "דסקטופ 1440px"} ═══\n`);
await login(p);
await ready(/בואו נתחיל|התואר שלכם/);
console.log(await shot(p, `${tag}1-welcome`, { full: true }));

// ── W2 — מסך בחירת התוכנית ────────────────────────────────────
const tW = await txt();
check("W2", !/באיזו תוכנית אתם לומדים\?/.test(tW) && /התוכנית שפכמון בנוי לה|כרגע פכ״מ בלבד/.test(tW),
  /באיזו תוכנית אתם לומדים/.test(tW) ? "‼️ עדיין שואל שאלה עם תשובה אחת" : (tW.match(/התוכנית שפכמון בנוי לה[^.]*\./) || ["(לא נמצא)"])[0]);
report(`${tag} מסך פתיחה`, await measure(p), errors);

await p.getByRole("button", { name: /^בואו נתחיל$/ }).first().click();
await ready(/איפה אתם בתואר|מתחילים את התואר עכשיו/, 40000);
console.log(await shot(p, `${tag}2-standing`));
await p.getByRole("button", { name: /מתחילים את התואר עכשיו/ }).first().click();
await settle(4000);
console.log(await shot(p, `${tag}3-profile`, { full: true }));

// פרופיל
for (const re of [/^שנה א׳$/, /^סמסטר א׳$/, /^לשון זכר$/]) {
  const e = p.getByRole("button", { name: re }).first();
  if (await e.count()) { await e.click().catch(() => {}); await p.waitForTimeout(400); }
}
const name = p.locator('input[type=text]').first();
if (await name.count()) await name.fill("אורי").catch(() => {});
await p.waitForTimeout(600);
const next = p.getByRole("button", { name: /^הבא$/ }).first();
if (await next.count()) { await next.click(); await settle(6000); }
console.log(await shot(p, `${tag}4-planner`, { full: true }));

// ── U6 — חובה מול בחירה ברשימת הסמסטר ─────────────────────────
const tags = await p.evaluate(() => {
  const rows = [...document.querySelectorAll("button,div")].filter((e) => /חובה|בחירה/.test(e.innerText || "") && (e.innerText || "").length < 90 && e.querySelectorAll("*").length < 12);
  const chips = [...document.querySelectorAll("span")].map((e) => (e.innerText || "").trim()).filter((x) => x === "חובה" || x === "בחירה");
  const counts = chips.reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {});
  return { counts, rowsSample: rows.slice(0, 3).map((e) => (e.innerText || "").replace(/\s+/g, " ").slice(0, 70)) };
});
check("U6", (tags.counts["חובה"] ?? 0) > 0,
  `תגי "חובה": ${tags.counts["חובה"] ?? 0} · תגי "בחירה": ${tags.counts["בחירה"] ?? 0}`);
const tP = await txt();
console.log("  מערכת:", (tP.match(/(\d+) ש״ס/) || ["?"])[0], "·", (tP.match(/סמסטר [אב]׳/) || ["?"])[0]);
report(`${tag} מתכנן`, await measure(p), errors);

console.log("\n── סיכום ──");
for (const [id, ok] of res) console.log(`${ok ? "✅" : "❌"} ${id}`);
console.log("שגיאות JS:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
