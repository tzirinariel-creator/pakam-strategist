// ============================================================
// שחזור L1 + L3 בנתיב הכבד: שנה ב׳ עם גיליון ציונים
// ------------------------------------------------------------
// אריאל, 4.9 בבוקר:
//   L1 "היה מסך טעינה בהתחלה שלא עבד לי איזה 3 פעמים אחרי ההרשמה"
//   L3 "כשסיימתי ושמרתי זה כתב לי שלא נשמרו קורסים — עד שעשיתי רענן"
// שניהם לא שוחזרו בנתיב שנה א׳ (5 שניות ל"הכול מוכן"). כאן הנתיב הכבד:
// גיליון אמיתי → 11 קורסים → הרבה יותר לשמור ולקרוא בחזרה.
//
// הרצה:  npm run reset:test  &&  node video/repro-L1-L3-heavy.mjs
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { trace, waitFor } from "./trace-lib.mjs";
import { fileURLToPath } from "node:url";

const SHEET = fileURLToPath(new URL("./fixtures/sheet-year2.png", import.meta.url));
const say = (m) => console.log(m);
const { b, p, errors } = await openApp();
const net = [];
p.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/") && r.status() >= 400) net.push(`HTTP ${r.status()} ${u.replace(BASE, "").slice(0, 90)}`);
});

const click = async (re, lbl) => {
  const e = p.getByRole("button", { name: re }).first();
  if (!(await e.count())) { say(`   ✗ אין כפתור: ${lbl ?? re}`); return false; }
  await e.click().catch(() => {});
  return true;
};
const screenText = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ").trim();
/** ממתין עד שהמסך באמת מרונדר — לא שלד. הריצה הראשונה לחצה על שלד וכשלה. */
const ready = async (re, ms = 60000) => {
  const t0 = Date.now();
  try {
    await p.waitForFunction(
      (src) => !document.querySelector("[class*=animate-pulse]") && new RegExp(src).test(document.body.innerText),
      re.source, { timeout: ms });
    return (Date.now() - t0) / 1000;
  } catch { return null; }
};

say("═══ שלב 0 · שחזור L1 + L3 · הנתיב הכבד ═══\n");

// ── 1 · התחברות ──────────────────────────────────────────
await login(p);
const tBoot = await ready(/בואו נתחיל|התואר שלכם|המצב שלי/, 90000);
say(`✅ מחובר · ${p.url().replace(BASE, "")} · המסך נטען אחרי ${tBoot === null ? "לא נטען!" : tBoot.toFixed(1) + "s"}`);
say(await shot(p, "H01-after-login"));

// ── 2 · האשף: "כבר יש לכם ש״ס" ────────────────────────────
await click(/^בואו נתחיל$/, "בואו נתחיל");
await ready(/איפה אתם בתואר|כבר יש לכם ש/, 40000);
const already = p.getByRole("button", { name: /כבר יש לכם ש/ }).first();
if (await already.count()) { await already.click(); say("✅ 'כבר יש לכם ש״ס'"); }
else say("   ✗ הכרטיס 'כבר יש לכם ש״ס' לא נמצא");
await ready(/העלו את גיליון|בחרו קובץ/, 40000);
say(await shot(p, "H02-upload-screen"));

// ── 3 · העלאת הגיליון + מדידת הסריקה ─────────────────────
const fi = p.locator("input[type=file]").first();
if (!(await fi.count())) { say("   ✗ אין קלט קובץ — עוצר"); await b.close(); process.exit(1); }
const tScan = Date.now();
await fi.setInputFiles(SHEET);
say("⏳ סורק את הגיליון…");
const scanned = await waitFor(p, /נמצאו|שורות|קראנו|לא הצלחנו|אינו זמין/, 150000);
say(scanned ? `✅ הסריקה חזרה אחרי ${scanned.toFixed(1)}s` : `   ‼️ הסריקה לא חזרה תוך 150s`);
say(`   (סה״כ מרגע ההעלאה: ${((Date.now() - tScan) / 1000).toFixed(1)}s)`);
await p.waitForTimeout(2500);
say(await shot(p, "H03-scan-result"));
const st = await screenText();
const mCourses = st.match(/קראנו (\d+|קורס אחד) קורס/);
const mCredits = st.match(/(\d+)\s*ש״ס/);
say(`   מה נקרא: ${mCourses ? mCourses[0] : "?"} · ${mCredits ? mCredits[0] : "?"}`);

// ── 4 · המשך האשף עד "סיום ושמירה" ───────────────────────
// הכפתור הראשי יושב בתחתית כל שלב — צריך לגלול אליו, אחרת הוא לא קיים בעין
const buttons = async () =>
  p.evaluate(() => [...document.querySelectorAll("button,a[role=button]")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
    .filter(Boolean));

// התוויות האמיתיות מהקוד, לא ניחוש
const ADVANCE = /^(נכון — המשיכו מכאן|נכון|הבא|ממשיכים|אישור והמשך|המשך|שמירה והמשך|בואו נבנה|לבניית המערכת|בונים את המערכת|יאללה|קדימה)/;
for (let i = 0; i < 10; i++) {
  await p.mouse.wheel(0, 4000);
  await p.waitForTimeout(1200);
  const t = await screenText();
  if (/סיום ושמירה/.test(t)) { say(`   הגעתי למסך השמירה (אחרי ${i} מעברים)`); break; }
  const labels = await buttons();
  const hit = labels.find((l) => ADVANCE.test(l));
  if (!hit) { say(`   (אין כפתור המשך בשלב ${i}) כפתורים: ${labels.join(" · ")}`); break; }
  say(`   → «${hit}»`);
  await p.getByRole("button", { name: new RegExp("^" + hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).first().click().catch(() => {});
  await p.waitForTimeout(4000);
  await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 30000 }).catch(() => {});
}
say(await shot(p, "H04-before-save"));

// ── 5 · L1: השמירה ומסך הטעינה שאחריה ────────────────────
say("\n▶ L1 — לוחץ 'סיום ושמירה' ומודד כל מסך שמופיע אחריו");
const save = p.getByRole("button", { name: /^סיום ושמירה$/ }).first();
if (!(await save.count())) { say("   ✗ אין 'סיום ושמירה'"); }
else {
  await save.click();
  const r = await trace(p, "L1-after-save", { ms: 75000, stuckAfter: 8000 });
  const t = await screenText();
  say(`\n   מסך סופי: ${p.url().replace(BASE, "")}`);
  say(`   ${t.slice(0, 260)}`);
  say(await shot(p, "H05-after-save"));
  // L3: האם המסך טוען שלא נשמרו קורסים?
  const notSaved = /אין קורסים בתוכנית|לא נשמרו|לא הצלחנו לשמור|עדיין לא תכננתם|התוכנית שלכם ריקה/.exec(t);
  if (notSaved) {
    say(`\n   ‼️‼️ L3 שוחזר: המסך אומר «${notSaved[0]}» מיד אחרי שמירה מוצלחת`);
    say("   " + (await shot(p, "H06-L3-NOT-SAVED")));
    // האם רענון מתקן? זה בדיוק מה שאריאל עשה
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(6000);
    const t2 = await screenText();
    const stillBad = /אין קורסים בתוכנית|לא נשמרו|התוכנית שלכם ריקה/.test(t2);
    say(`   אחרי רענון: ${stillBad ? "עדיין ריק (זו בעיית שרת)" : "✅ הקורסים מופיעים — זו בדיוק התלונה של אריאל"}`);
    say("   " + (await shot(p, "H07-after-reload")));
  } else {
    say("   ✓ L3 לא שוחזר כאן — אין הודעת 'לא נשמר' אחרי השמירה");
  }
  if (r.stuck.length) say(`\n   ‼️ L1 שוחזר: ${r.stuck.length} מצבי טעינה מעל 8 שניות`);
  else say("\n   ✓ L1 לא שוחזר בשמירה — אף מסך טעינה לא עבר 8 שניות");
}

// ── 6 · L3 המשך: עריכה בלוח ושמירה שנייה ─────────────────
say("\n▶ L3 — נכנס ללוח, עורך, ושומר שוב (הרצף שאריאל תיאר)");
await p.goto(`${BASE}/he/planner`, { waitUntil: "networkidle" });
await p.waitForTimeout(6000);
say(await shot(p, "H08-planner"));
const edit = p.getByRole("link", { name: /תכננו את שני הסמסטרים|לעריכת התכנון|עריכה מלאה/ }).first();
const editB = p.getByRole("button", { name: /תכננו את שני הסמסטרים|לעריכת התכנון|עריכה מלאה/ }).first();
if (await edit.count()) await edit.click().catch(() => {});
else if (await editB.count()) await editB.click().catch(() => {});
else say("   ✗ לא נמצא כפתור עריכה");
await p.waitForTimeout(7000);
say(`   URL: ${p.url().replace(BASE, "")}`);
say(await shot(p, "H09-editor"));

const save2 = p.getByRole("button", { name: /^סיום ושמירה$/ }).first();
if (await save2.count()) {
  await save2.click();
  const r2 = await trace(p, "L3-second-save", { ms: 60000, stuckAfter: 8000 });
  const t3 = await screenText();
  const bad2 = /אין קורסים בתוכנית|לא נשמרו|לא הצלחנו לשמור|התוכנית שלכם ריקה/.exec(t3);
  say(`\n   מסך: ${t3.slice(0, 240)}`);
  if (bad2) { say(`   ‼️‼️ L3 שוחזר בשמירה השנייה: «${bad2[0]}»`); say("   " + (await shot(p, "H10-L3-second"))); }
  else say("   ✓ אין הודעת 'לא נשמר' בשמירה השנייה");
  if (r2.stuck.length) say(`   ‼️ ${r2.stuck.length} מצבי טעינה מעל 8s בשמירה השנייה`);
  say(await shot(p, "H11-final"));
} else say("   ✗ אין 'סיום ושמירה' בעורך");

say(`\n═══ סיכום ═══`);
say(`שגיאות JS: ${errors.length ? [...new Set(errors)].join(" | ") : "אין"}`);
say(`כשלי רשת: ${net.length ? [...new Set(net)].join(" | ") : "אין"}`);
await b.close();
