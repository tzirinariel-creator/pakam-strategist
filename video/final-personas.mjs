// ============================================================
// שלב 11 — סיור סופי בשלוש פרסונות, כמשתמש חי
// ------------------------------------------------------------
// אריאל, 5.9: *"משתמש של שנה א׳, שנה ב׳ ושנה ג׳ ... ממש עובר בה על כל
// לחצן ומסך כמשתמש — כלומר עם צילום מסך ולא רק בדיקה בקוד — ורואה
// שהכול הגיוני וקוהרנטי."*
//
// כל פעולה כאן היא לחיצה אמיתית על פרודקשן, ואחריה מדידה: שגיאות JS,
// גלישה אופקית, הפרות RTL, וטקסט שבור. נכתב לדיסק אחרי כל מסך, כך
// שהפסקה עולה מסך אחד ולא ריצה שלמה.
//
//   node video/final-personas.mjs --persona y1|y2|y3 [--width 1440|390]
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (f, d) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const PERSONA = arg("--persona", "y2");
const WIDTH = +arg("--width", "1440");
const OUT = fileURLToPath(new URL(`../docs/סיור-סופי-${PERSONA}-${WIDTH}.json`, import.meta.url));

const ROUTES = [
  ["/he/dashboard", "בית"],
  ["/he/planner", "תכנון התואר"],
  ["/he/bidding", "בידינג"],
  ["/he/regulations", "דרישות התואר"],
  ["/he/record", "התיק האקדמי"],
  ["/he/graduation", "מחשבון ציון גמר"],
  ["/he/miluim", "מילואים"],
  ["/he/exam", "לוח הבחינות"],
  ["/he/exam-planner", "תכנון מבחנים"],
  ["/he/calendar", "יומן"],
  ["/he/catalog", "קטלוג קורסים"],
  ["/he/lineage", "השושלת"],
  ["/he/guide", "מדריך מתחיל"],
  ["/he/settings", "הגדרות"],
  ["/he/cohort", "המחזור"],
  ["/he/mentors", "חונכים"],
  // בדיקת הקישורים של 5.9 מצאה שזה היעד היחיד מתוך 57 קישורים פנימיים
  // שאף סיור לא ביקר בו — ודווקא דף היועץ, שהלוח והמדריך מקשרים אליו
  // ב"דברו עם המלך הפילוסוף". רשימת מסלולים שכתבתי מהזיכרון פספסה אותו.
  ["/he/mentor", "המלך הפילוסוף"],
];

// לחצנים שלא נוגעים בהם: הרסניים, או כאלה שמוציאים מהחשבון.
const FORBIDDEN = /מחיקת החשבון|מחק את החשבון|התנתקות|התנתק|יציאה מהחשבון|Sign out|מחיקה לצמיתות/;

const { b, p, errors } = await openApp({ width: WIDTH, height: WIDTH < 700 ? 844 : 1100 });
const settle = async (ms = 4000) => {
  await p.waitForFunction(() => document.body.innerText.replace(/\s+/g, " ").length > 500, null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(ms);
  await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), null, { timeout: 40000 }).catch(() => {});
};
const dismiss = async () => {
  for (let i = 0; i < 3; i++) {
    if (!(await p.locator("[data-slot=dialog-overlay]").count())) return;
    const c = p.getByRole("button", { name: /^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/ }).first();
    if (await c.count()) await c.click().catch(() => {}); else await p.keyboard.press("Escape");
    await p.waitForTimeout(800);
  }
};

/** המדידה: מה שאפשר לראות על המסך, לא מה שכתוב בקוד. */
const measure = async () =>
  p.evaluate(() => {
    const out = { overflow: [], rtl: [], broken: [], tiny: [] };
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 2) out.overflow.push(`הגוף גולש ${de.scrollWidth - de.clientWidth}px`);
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > de.clientWidth + 2 || r.left < -2) {
        // מערכת שעות ולוחות רחבים נגללים אופקית **בכוונה**, בתוך מיכל
        // עם overflow-x. תא שחורג מהמסך בתוך מיכל כזה אינו באג — הוא
        // הדרך הנכונה. הגלאי דיווח "bdi 09:00–10:00 חורג" בזמן שהגוף
        // עצמו לא גלש בכלל; זו הייתה התרעת שווא.
        let scroller = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === "auto" || ox === "scroll") { scroller = true; break; }
        }
        const s = (el.innerText || "").trim().slice(0, 28);
        if (!scroller && s && out.overflow.length < 6) out.overflow.push(`${el.tagName.toLowerCase()} "${s}" חורג`);
      }
      // RTL: dir="ltr" על טקסט שמכיל עברית — bdi הוא הפתרון הנכון
      if (el.getAttribute("dir") === "ltr" && el.tagName !== "BDI") {
        const s = (el.textContent || "").trim();
        if (/[֐-׿]/.test(s) && out.rtl.length < 5) out.rtl.push(`dir=ltr על "${s.slice(0, 40)}"`);
      }
    }
    const t = document.body.innerText;
    for (const bad of ["undefined", "NaN", "[object Object]", "null ש״ס", "Infinity"])
      if (t.includes(bad)) out.broken.push(bad);
    return out;
  });

const record = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : { persona: PERSONA, width: WIDTH, screens: {} };
const save = () => writeFileSync(OUT, JSON.stringify(record, null, 1), "utf-8");

console.log(`═══ סיור ${PERSONA} · ${WIDTH}px ═══`);
await login(p);
await p.waitForTimeout(5000);

// שער הפרסונה. ב-5.9 זריעת y2 נפלה בחריגת זמן (ה-AI החזיר 429 והסריקה
// לא הספיקה), החשבון נשאר ריק — והסיור המשיך לרוץ ותייג חשבון ריק
// כ"שנה ב׳". סיור מתויג לא נכון גרוע מסיור שלא רץ, כי הוא נראה כמו ראיה.
{
  await p.goto(`${BASE}/he/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(6000);
  const seen = await p.locator("body").innerText();
  const want = { y1: "שנה א׳", y2: "שנה ב׳", y3: "שנה ג׳" }[PERSONA];
  if (!seen.includes(want)) {
    const got = (seen.match(/שנה [א-ג]׳/) || ["לא נמצאה שנה"])[0];
    console.log(`❌ שער הפרסונה: ביקשתי ${PERSONA} (${want}), החשבון מראה "${got}". לא רץ.`);
    await b.close();
    process.exit(2);
  }
  console.log(`✓ שער הפרסונה: החשבון הוא ${want}`);
}

for (const [route, label] of ROUTES) {
  if (record.screens[route]?.done) { console.log(`⏭  ${label}`); continue; }
  const scr = { label, actions: [], issues: [], at: new Date().toISOString() };
  try {
    await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await settle(5000);
    await dismiss();
    errors.length = 0;

    const m = await measure();
    scr.issues.push(...m.overflow, ...m.rtl, ...m.broken.map((x) => `טקסט שבור: ${x}`));
    scr.shot = (await shot(p, `P-${PERSONA}-${WIDTH}-${label}`)).split("/").pop();
    scr.chars = (await p.locator("body").innerText()).replace(/\s+/g, " ").length;

    // כל לחצן ולשונית על המסך — לא רשימה שהכנתי מראש, אלא מה שבאמת שם.
    const controls = await p.evaluate((forbidden) => {
      const seen = new Set();
      return [...document.querySelectorAll('main button, main [role=tab], main [role=switch]')]
        .map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim())
        .filter((x) => x && x.length < 45 && !new RegExp(forbidden).test(x) && !seen.has(x) && seen.add(x))
        .slice(0, 14);
    }, FORBIDDEN.source);

    for (const name of controls) {
      const el = p.locator("main button, main [role=tab], main [role=switch]").filter({ hasText: name }).first();
      if (!(await el.count())) continue;
      errors.length = 0;
      // כפתור מושבת אינו כפתור שבור. "שמרו פרופיל" בלי שינויים ו"שמרו
      // מפתח" בלי מפתח **אמורים** להיות מושבתים, והריצה הראשונה ספרה
      // אותם ככישלון ודיווחה 4/13 על מסך תקין לגמרי.
      const state = await el.evaluate((e) => ({
        disabled: e.hasAttribute("disabled") || e.getAttribute("aria-disabled") === "true",
        visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length),
      })).catch(() => ({ disabled: false, visible: true }));
      if (state.disabled) { scr.actions.push({ name, ok: true, why: "מושבת כצפוי" }); continue; }
      if (!state.visible) { scr.actions.push({ name, ok: true, why: "מוסתר במצב הזה" }); continue; }
      await el.scrollIntoViewIfNeeded().catch(() => {});
      let clicked = false;
      try { await el.click({ timeout: 6000 }); clicked = true; } catch {}
      if (!clicked) { try { await el.click({ timeout: 4000, force: true }); clicked = true; } catch {} }
      if (!clicked) { scr.actions.push({ name, ok: false, why: "לא ניתן ללחוץ" }); continue; }
      await p.waitForTimeout(2200);
      const after = await measure();
      const bad = [...after.overflow, ...after.rtl, ...after.broken.map((x) => `טקסט שבור: ${x}`)];
      const js = [...new Set(errors)].filter((e) => !/ResizeObserver|Non-Error promise/.test(e)).slice(0, 2);
      scr.actions.push({ name, ok: bad.length === 0 && js.length === 0, issues: bad.slice(0, 3), js });
      if (bad.length || js.length) scr.issues.push(`אחרי "${name}": ${[...bad.slice(0, 2), ...js].join(" · ")}`);
      await dismiss();
      if (!p.url().includes(route.split("/").pop())) {
        await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
        await settle(3500); await dismiss();
      }
    }
    scr.done = true;
    const okN = scr.actions.filter((a) => a.ok).length;
    console.log(`${scr.issues.length ? "⚠️ " : "✅"} ${label.padEnd(16)} ${okN}/${scr.actions.length} פעולות · ${scr.issues.length} ממצאים`);
    scr.issues.slice(0, 3).forEach((i) => console.log(`      ${i}`));
  } catch (e) {
    scr.issues.push(`חריגה: ${String(e).slice(0, 140)}`);
    console.log(`❌ ${label}: ${String(e).slice(0, 120)}`);
  }
  record.screens[route] = scr;
  save();
}
const tot = Object.values(record.screens);
console.log(`\n── ${tot.length} מסכים · ${tot.reduce((s, x) => s + (x.actions?.length || 0), 0)} פעולות · ${tot.reduce((s, x) => s + x.issues.length, 0)} ממצאים ──`);
await b.close();
