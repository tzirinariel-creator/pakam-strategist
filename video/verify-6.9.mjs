// ============================================================
// אימות חי של ההערות מ-5.9 — כמשתמש, עם צילום מסך לכל אחת
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";

const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
const t0 = Date.now();
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
console.log(`התחברות + דף הבית: ${Date.now() - t0}ms`);

const go = async (path, waitFor) => {
  const t = Date.now();
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  if (waitFor)
    await p.waitForFunction((s) => document.body.innerText.includes(s), waitFor, { timeout: 45000 }).catch(() => {});
  else await p.waitForFunction(() => document.body.innerText.length > 500, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(2500);
  return Date.now() - t;
};
const around = async (needle, before = 500, after = 500) => {
  const txt = await p.evaluate(() => document.body.innerText);
  const i = txt.indexOf(needle);
  return i < 0 ? `(לא נמצא: ${needle})` : txt.slice(Math.max(0, i - before), i + after);
};

// ── A1 · זמן טעינה ──
console.log("\n═══ A1 · זמן טעינה של מסך הבית ═══");
for (let i = 0; i < 3; i++) {
  const ms = await go("/he/dashboard", "המצב שלי");
  const panic = await p.evaluate(() => document.body.innerText.includes("הטעינה לוקחת יותר מהרגיל") || document.body.innerText.includes("הטעינה קצת איטית"));
  console.log(`  סבב ${i + 1}: ${ms}ms · מסך "טעינה איטית": ${panic ? "❌ הופיע" : "✅ לא הופיע"}`);
}
await shot(p, "V69-A1-dashboard", { full: true });

// ── A12 + A13 · מחשבון ציון גמר ──
console.log("\n═══ A12 + A13 · מחשבון ציון הגמר ═══");
await go("/he/graduation", "מחשבון ציון הגמר");
await shot(p, "V69-A12-graduation", { full: true });
console.log("— הצטיינות —\n" + (await around("ביחס להצטיינות", 100, 700)));
console.log("\n— ציון גמר —\n" + (await around("ציון גמר", 200, 700)));
console.log("\n— איזה ציון נדרש —\n" + (await around("איזה ציון נדרש", 60, 700)));

// ── A5 + A4 · מסך תכנון הסמסטר ──
console.log("\n═══ A5 + A4 · התקדמות בתואר וסדר הכפתורים ═══");
await go("/he/planner/semester", "התקדמות בתואר");
await shot(p, "V69-A5-semester-planner", { full: true });
console.log(await around("התקדמות בתואר", 700, 300));
const btns = await p.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((el) => /הוספה ועריכה|סיום ושמירה|תכננו סמסטר נוסף/.test(el.innerText))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return `${el.innerText.replace(/\s+/g, " ").trim()} · ${Math.round(r.width)}×${Math.round(r.height)} · רקע ${cs.backgroundColor} · משקל ${cs.fontWeight} · top ${Math.round(r.top + window.scrollY)}`;
    }));
console.log("\nכפתורים לפי סדר במסמך:");
for (const s of btns) console.log("  " + s);

// ── A14 · יומן ──
console.log("\n═══ A14 · יומן ═══");
await go("/he/calendar", "יומן אקדמי");
const link = await p.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => x.innerText.includes("חברו ליומן"));
  return a ? a.getAttribute("href") : null;
});
console.log("  הקישור מהיומן:", link);
await p.goto(`${BASE}/he/settings#google-calendar`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const anchored = await p.evaluate(() => {
  const el = document.getElementById("google-calendar");
  if (!el) return "❌ אין אנקור";
  const r = el.getBoundingClientRect();
  return `✅ האנקור קיים · top=${Math.round(r.top)} (0 = ממש למעלה) · גלילה=${Math.round(window.scrollY)}`;
});
console.log("  ", anchored);
await shot(p, "V69-A14-settings-anchor");

console.log("\n═══ שגיאות JS ═══");
console.log(errors.length ? errors.slice(0, 8).join("\n") : "אין");
await b.close();
