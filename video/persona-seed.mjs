// ============================================================
// הבאת חשבון הבדיקה למצב של פרסונה — דרך הממשק בלבד
// ------------------------------------------------------------
// הכול עובר במסלולי הכתיבה האמיתיים של האפליקציה. לא כותבים למסד ישירות:
// ב-4.9 בבוקר זריקה ישירה של שורות מילואים דילגה על `deriveGroupFromDays`
// והולידה "באג בזכאויות" שלא היה קיים. הכלי לא ישקר לי פעמיים.
//
//   npm run reset:test && node video/persona-seed.mjs --persona y1|y2|y3
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { fileURLToPath } from "node:url";

const SHEET = fileURLToPath(new URL("./fixtures/sheet-year2.png", import.meta.url));
const arg = (f, d) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const P = arg("--persona", "y2");

const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const settle = async (ms = 4000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), null, { timeout: 45000 }).catch(() => {}); };
const ready = async (re, ms = 90000) => { try { await p.waitForFunction((x) => !document.querySelector("[class*=animate-pulse]") && new RegExp(x).test(document.body.innerText), re.source, { timeout: ms }); return true; } catch { return false; } };
const txt = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const click = async (re, ms = 3000) => { const e = p.getByRole("button", { name: re }).first(); if (!(await e.count())) return false; try { await e.click({ timeout: 8000 }); } catch { return false; } await p.waitForTimeout(ms); return true; };

console.log(`═══ זריעת פרסונה ${P} ═══`);
await login(p);
await ready(/בואו נתחיל|התואר שלכם|המצב שלי|כל מה שחשוב/);

if (/בואו נתחיל/.test(await txt())) {
  await click(/^בואו נתחיל$/, 3000);
  await ready(/איפה אתם בתואר/, 40000);

  if (P === "y1") {
    await click(/מתחילים את התואר עכשיו/, 4000);
    for (const re of [/^שנה א׳$/, /^סמסטר א׳$/, /^לשון זכר$/]) {
      const e = p.getByRole("button", { name: re }).first();
      if (await e.count()) { await e.click().catch(() => {}); await p.waitForTimeout(400); }
    }
    const name = p.locator("input[type=text]").first();
    if (await name.count()) await name.fill("אורי").catch(() => {});
  } else {
    // y2 / y3 — הנתיב הכבד, עם גיליון אמיתי
    await p.getByRole("button", { name: /כבר יש לכם ש/ }).first().click();
    await ready(/העלו את גיליון|בחרו קובץ/, 40000);
    await p.locator("input[type=file]").first().setInputFiles(SHEET);
    // החתימה היא waitForFunction(fn, arg, options). בלי ה-null באמצע,
    // ה-{timeout} נבלע כארגומנט לפונקציה וחלה ברירת המחדל — 30 שניות
    // במקום 150. סריקת הגיליון עוברת דרך Gemini, ובזמן 429 היא לוקחת
    // יותר מ-30; כך נפלה זריעת y2 ב-5.9 והשאירה חשבון ריק מתויג "שנה ב׳".
    await p.waitForFunction(() => /קראנו|לא הצלחנו/.test(document.body.innerText), null, { timeout: 150000 });
    await p.waitForTimeout(2500);
    console.log("✅ הגיליון נסרק:", ((await txt()).match(/קראנו \d+ קורסים? שהושלמו/) || ["?"])[0]);
    await click(/^נכון — המשיכו מכאן$/, 4000);
  }

  await click(/^הבא$/, 4500);
  console.log("שומר…");
  await p.getByRole("button", { name: /^סיום ושמירה$/ }).first().click();
  await p.waitForFunction(() => /הכול מוכן/.test(document.body.innerText), null, { timeout: 150000 });
  console.log("✅ האשף הסתיים");
  await click(/לדף הבית/, 8000);
} else {
  console.log("(החשבון כבר מאותחל — מדלג על האשף)");
}
await settle(6000);

// ── y3: שנת תחילה 2024 ושלוש תקופות מילואים, דרך המסכים ──
if (P === "y3") {
  await p.goto(`${BASE}/he/settings`, { waitUntil: "networkidle" }); await settle(6000);
  const trig = p.locator('[aria-labelledby="settings-start-year-label"]').first();
  if (await trig.count()) {
    await trig.click(); await p.waitForTimeout(1200);
    const opts = await p.getByRole("option").allInnerTexts();
    console.log("שנות תחילה זמינות:", JSON.stringify(opts));
    const want = opts.find((o) => /תשפ״ה|2024/.test(o)) ?? opts[opts.length - 1];
    await p.getByRole("option", { name: want }).first().click().catch(() => {});
    await p.waitForTimeout(1000);
    await click(/שמירה|שמרו|עדכון/, 5000);
    console.log(`✅ שנת תחילה: ${want}`);
  }
  await p.goto(`${BASE}/he/miluim`, { waitUntil: "networkidle" }); await settle(7000);
  // מנקים שורות קודמות, ואז שלוש תקופות **שונות** — שנה וסמסטר לכל אחת.
  // הגרסה הראשונה שלי מילאה את אותו טופס שלוש פעמים, ולכן רק הערך האחרון
  // שרד ונוצרה שורה ריקה. הקבוצה נגזרת פר-סמסטר, אז שלוש שורות זהות לא
  // בודקות כלום.
  for (let i = 0; i < 6; i++) {
    const del = p.locator("button").filter({ hasText: /^מחקו את/ }).first();
    if (!(await del.count())) break;
    await del.click().catch(() => {});
    await p.waitForTimeout(900);
  }
  const rows = [
    { year: "תשפ״ה", sem: "א׳", days: 45, combat: true },
    { year: "תשפ״ה", sem: "ב׳", days: 30, combat: true },
    { year: "תשפ״ו", sem: "א׳", days: 20, combat: false },
  ];
  for (const r of rows) {
    const sels = p.locator("select");
    await sels.nth(0).selectOption({ label: r.year }).catch(() => {});
    await sels.nth(1).selectOption({ label: r.sem }).catch(() => {});
    await p.waitForTimeout(500);
    await p.locator('input[type="number"]').first().fill(String(r.days));
    const cb = p.locator('input[type="checkbox"]').first();
    if (await cb.count()) { if (r.combat) await cb.check().catch(() => {}); else await cb.uncheck().catch(() => {}); }
    await p.waitForTimeout(400);
    await click(/^הוסיפו סמסטר$/, 1800);
  }
  await click(/^שמירת מילואים$/, 7000);
  await settle(3000);
  const table = await p.evaluate(() =>
    [...document.querySelectorAll("tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ").trim()));
  console.log("✅ שורות מילואים:");
  for (const r of table) console.log("   " + r);
}

const final = await txt();
console.log("\nמצב סופי:", (final.match(/פכ״מ · שנה [אבג]׳ · סמסטר [אב]׳/) || ["?"])[0],
            "·", (final.match(/(\d+) \/ 150/) || ["?"])[0]);
console.log(await shot(p, `seed-${P}`));
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
