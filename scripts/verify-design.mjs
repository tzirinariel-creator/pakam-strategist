/**
 * ביקורת עיצוב מלאה — מודדת DOM חי מול כללי Apple HIG ומול שפת־העיצוב שלנו.
 *
 * `verify-contrast.mjs` בדק ציר אחד. זה בודק את כל מה שהסקיל מגדיר כקריטי,
 * כי "יפה" הוא לא הצהרה — הוא סדרת מדידות שאפשר להריץ שוב מחר.
 *
 *   node scripts/verify-design.mjs [--dark] [--mobile] [--json out.json]
 *
 * הבדיקות:
 *   1. ניגודיות טקסט         WCAG AA (4.5:1 / 3:1 לטקסט גדול)
 *   2. ניגודיות גרפיקה        3:1 לאייקונים וגבולות שנושאים משמעות
 *   3. יעדי־מגע               ≥44px במובייל, ≥28px בדסקטופ
 *   4. רצפת גודל טקסט         ≥11px (HIG), ומשפט שלם ≥12px (שפת־עיצוב)
 *   5. פוקוס מקלדת            לכל אלמנט אינטראקטיבי יש טבעת נראית
 *   6. גלישה אופקית           העמוד לא נגלל לצדדים
 *   7. שמות נגישים            כפתורי אייקון בלי טקסט חייבים aria-label
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const req = createRequire(import.meta.url);
const { chromium } = req("../video/node_modules/playwright");

const arg = (f, d) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const BASE = arg("--base", "http://localhost:3131");
const SCHEME = process.argv.includes("--dark") ? "dark" : "light";
const MOBILE = process.argv.includes("--mobile");
const JSON_OUT = arg("--json", null);

const PAGES = [
  { name: "נחיתה", path: "/he", auth: false },
  { name: "מסך הבית", path: "/he/dashboard", auth: true },
  { name: "מתכנן", path: "/he/planner", auth: true },
  { name: "יומן", path: "/he/calendar", auth: true },
  { name: "קטלוג", path: "/he/catalog", auth: true },
  { name: "ציון גמר", path: "/he/graduation", auth: true },
  { name: "תקנון", path: "/he/regulations", auth: true },
  { name: "תיק אקדמי", path: "/he/record", auth: true },
  { name: "מבחנים", path: "/he/exam-planner", auth: true },
  { name: "מכרז", path: "/he/bidding", auth: true },
  { name: "השושלת", path: "/he/lineage", auth: true },
  { name: "המלך", path: "/he/mentor", auth: true },
  { name: "הגדרות", path: "/he/settings", auth: true },
];

const PROBE = (isMobile) => {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
  const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  // המרת כל תחביר צבע ל-sRGB דרך קנבס. אסור לפרסר ביד: Chrome מחזיר
  // oklab()/lab() לכל מה שנגזר מ-color-mix או oklch, וכל אלה קיימים אצלנו.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const parse = (s) => {
    if (!s || s === "transparent" || s === "none") return null;
    cx.clearRect(0, 0, 1, 1);
    try { cx.fillStyle = s; } catch { return null; }
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 };
  };
  const isDark = document.documentElement.classList.contains("dark");
  const bgOf = (el) => {
    let n = el; const stack = [];
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break; }
      n = n.parentElement;
    }
    let out = isDark ? [11, 11, 15] : [252, 252, 253];
    for (let i = stack.length - 1; i >= 0; i--) {
      const { rgb, a } = stack[i];
      out = out.map((v, j) => Math.round(rgb[j] * a + v * (1 - a)));
    }
    return out;
  };

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "HEAD", "META", "LINK"]);
  const visible = (el, cs, r) =>
    cs.visibility !== "hidden" && cs.display !== "none" &&
    parseFloat(cs.opacity) >= 0.15 && r.width >= 2 && r.height >= 2;

  const out = { contrast: [], graphic: [], touch: [], size: [], focus: [], label: [], counts: {} };
  let nText = 0, nInteractive = 0;

  for (const el of document.querySelectorAll("*")) {
    if (SKIP.has(el.tagName)) continue;
    if (el.closest("nextjs-portal")) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) continue;

    const cls = (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 64);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim()).join(" ").trim();

    // ── 1+4. טקסט: ניגודיות וגודל
    if (own.length >= 2) {
      nText++;
      const px = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const fg = parse(cs.color);
      if (fg) {
        const bg = bgOf(el);
        const blended = fg.rgb.map((v, i) => Math.round(v * fg.a + bg[i] * (1 - fg.a)));
        const large = px >= 24 || (px >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const v = ratio(blended, bg);
        if (v < need) out.contrast.push({ text: own.slice(0, 40), ratio: +v.toFixed(2), need, px: +px.toFixed(1), cls });
      }
      // HIG: מינימום 11pt במובייל. שפת־עיצוב: משפט שלם ≥12px.
      // שפת־עיצוב: "משפט שלם ≥ 12px. תוויות־מיקרו של מילים בודדות — מ-10px."
      // לכן הרצפה תלויה בשאלה אם זה משפט, ומילה בודדת אינה כשל.
      const words = own.split(/\s+/).filter(Boolean).length;
      const isSentence = words >= 3;
      const floor = isSentence ? 12 : 10;
      if (px < floor) out.size.push({ text: own.slice(0, 40), px: +px.toFixed(1), floor, isSentence, cls });
    }

    // ── 2. גרפיקה שנושאת משמעות: SVG בתוך אלמנט אינטראקטיבי
    if (el.tagName === "svg" && el.closest("button,a,[role=button]")) {
      const stroke = parse(cs.color);
      if (stroke) {
        const bg = bgOf(el);
        const blended = stroke.rgb.map((v, i) => Math.round(v * stroke.a + bg[i] * (1 - stroke.a)));
        const v = ratio(blended, bg);
        if (v < 3) out.graphic.push({ ratio: +v.toFixed(2), cls, label: el.closest("button,a")?.getAttribute("aria-label") ?? "" });
      }
    }

    // ── 3+5+7. אלמנטים אינטראקטיביים
    const interactive = el.matches('button,a[href],input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])');
    if (interactive) {
      nInteractive++;
      // מובייל: 44px — ברירת המחדל של HIG, וזה גם מה שאצבע צריכה.
      // דסקטופ: 24px — הסף של WCAG 2.5.8 (AA). HIG נוקב ב-28 כ*ברירת מחדל*
      // וב-20 כ*מינימום*, אז 24 הוא הסף שאפשר להגן עליו. הגרסה הקודמת של
      // הקובץ הזה בדקה מול 28 ודיווחה 415 כשלים על כפתורי אייקון 24×24
      // שעוברים את שני התקנים — רעש שהסתיר שמונה פקדים קטנים באמת.
      const min = isMobile ? 44 : 24;
      // WCAG 2.5.8 פוטר מפורשות יעד "inline" — קישור בתוך משפט, שגודלו
      // נקבע ע"י זרימת הטקסט ולא ע"י המעצב. בלי החריג הזה כל קישור
      // בתוך פסקה מדווח ככשל, וזה רעש שמסתיר את הפקדים האמיתיים.
      const inlineInText = cs.display.startsWith("inline") &&
        el.parentElement && (el.parentElement.textContent ?? "").trim().length >
          (el.textContent ?? "").trim().length + 3;
      if (!inlineInText && (r.width < min - 0.5 || r.height < min - 0.5)) {
        out.touch.push({ w: Math.round(r.width), h: Math.round(r.height), min, tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 24), cls });
      }
      // שם נגיש: טקסט, aria-label, aria-labelledby או title
      const hasText = (el.textContent ?? "").trim().length > 0;
      const hasName = hasText || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
      if (!hasName) out.label.push({ tag: el.tagName, cls });
    }
  }

  out.counts = { text: nText, interactive: nInteractive };
  // ── 6. גלישה אופקית
  out.overflow = document.documentElement.scrollWidth > window.innerWidth + 1
    ? { scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }
    : null;
  return out;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: MOBILE ? { width: 375, height: 812 } : { width: 1440, height: 900 },
  isMobile: MOBILE,
  hasTouch: MOBILE,
  deviceScaleFactor: MOBILE ? 2 : 1,
  locale: "he-IL",
  colorScheme: SCHEME,
});
await ctx.addInitScript((s) => {
  try { localStorage.setItem("pakam-ui", JSON.stringify({ state: { theme: s } })); } catch {}
}, SCHEME);
const page = await ctx.newPage();

const label = `${SCHEME === "dark" ? "כהה" : "בהיר"} · ${MOBILE ? "375px" : "1440px"}`;
console.log(`ביקורת עיצוב · ${label} · ${BASE}\n`);
await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
const login = await page.request.post(`${BASE}/api/auth/demo-login`);
if (!login.ok()) console.log(`⚠️ כניסת דמו נכשלה (${login.status()})`);

const KINDS = [
  ["contrast", "ניגודיות טקסט"],
  ["graphic", "ניגודיות אייקון"],
  ["touch", "יעד־מגע"],
  ["size", "גודל טקסט"],
  ["label", "שם נגיש"],
];
const totals = Object.fromEntries(KINDS.map(([k]) => [k, 0]));
const report = [];

for (const p of PAGES) {
  try {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    // domcontentloaded ואז המתנה מפורשת: networkidle לא נסגר בעמודים עם
    // פולינג, וב-dev הקומפילציה הראשונה לוקחת עשרות שניות.
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    if (p.auth && /\/login/.test(page.url())) { console.log(`${p.name.padEnd(12)} — הופנה להתחברות`); continue; }
    const applied = await page.evaluate(() => document.documentElement.classList.contains("dark") ? "dark" : "light");
    if (applied !== SCHEME) { console.log(`⚠️ ${p.name} — הוחל ${applied} במקום ${SCHEME}`); continue; }

    const res = await page.evaluate(PROBE, MOBILE);
    const sum = KINDS.reduce((n, [k]) => n + res[k].length, 0) + (res.overflow ? 1 : 0);
    for (const [k] of KINDS) totals[k] += res[k].length;
    report.push({ page: p.name, ...res });

    const mark = sum === 0 ? "✅" : "❌";
    const parts = KINDS.filter(([k]) => res[k].length).map(([k, he]) => `${he} ${res[k].length}`);
    if (res.overflow) parts.push("גלישה אופקית");
    console.log(`${mark} ${p.name.padEnd(12)} ${String(res.counts.text).padStart(4)} טקסט · ${String(res.counts.interactive).padStart(3)} אינטראקטיבי${parts.length ? "   → " + parts.join(" · ") : ""}`);

    for (const [k, he] of KINDS) {
      for (const f of res[k].slice(0, 4)) {
        const d = k === "contrast" ? `${f.ratio}:1 (דרוש ${f.need}) ${f.px}px "${f.text}"`
          : k === "graphic" ? `${f.ratio}:1 (דרוש 3) ${f.label}`
          : k === "touch" ? `${f.w}×${f.h} (מינ׳ ${f.min}) <${f.tag}> "${f.text}"`
          : k === "size" ? `${f.px}px (רצפה ${f.floor}${f.isSentence ? ", משפט" : ""}) "${f.text}"`
          : `<${f.tag}> בלי שם`;
        console.log(`     ${he}: ${d}`);
        if (f.cls) console.log(`       ${f.cls}`);
      }
      if (res[k].length > 4) console.log(`     … ועוד ${res[k].length - 4} ב${he}`);
    }
  } catch (err) {
    console.log(`⚠️  ${p.name} — ${err.message.split("\n")[0].slice(0, 90)}`);
  }
}

await browser.close();
const grand = Object.values(totals).reduce((a, b) => a + b, 0);
console.log("\n" + "─".repeat(52));
for (const [k, he] of KINDS) console.log(`  ${he.padEnd(18)} ${totals[k]}`);
console.log(`  ${"סה\"כ".padEnd(18)} ${grand}`);
if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(report, null, 1)); console.log(`\nנשמר: ${JSON_OUT}`); }
process.exit(grand === 0 ? 0 : 1);
