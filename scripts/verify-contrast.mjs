/**
 * אימות דפדפן לרצפת הניגודיות — מודד DOM אמיתי, לא צילום מסך.
 *
 * החוקה: "אמת רק מה שנבדק." עד עכשיו הטענה שהטקסט עומד ב-AA הייתה
 * חישוב על ערכי טוקנים. כאן קוראים את ה-computed style של כל אלמנט טקסט
 * בעמוד חי, מחשבים ניגודיות מול הרקע האפקטיבי, ומדווחים כישלונות.
 *
 *   node scripts/verify-contrast.mjs [--base http://localhost:3131]
 */
// Playwright מותקן ב-video/node_modules ולא בשורש — הוא כלי אימות, ואין
// סיבה להוסיף 150MB של דפדפן לתלויות של האפליקציה עצמה ולזמן ההתקנה ב-CI.
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req("../video/node_modules/playwright");

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3131";

const SCHEME = process.argv.includes("--dark") ? "dark" : "light";
// 375px הוא הרוחב שהחוקה מחייבת ("רב־זוויתיות"). מסכים צרים מרנדרים
// רכיבים אחרים לגמרי — סרגל תחתון, צ'יפים דחוסים — שלא נבדקו כלל.
const MOBILE = process.argv.includes("--mobile");

const PAGES = [
  { name: "נחיתה", path: "/he", auth: false },
  { name: "מסך הבית", path: "/he/dashboard", auth: true },
  { name: "מתכנן", path: "/he/planner", auth: true },
  { name: "יומן", path: "/he/calendar", auth: true },
  { name: "קטלוג", path: "/he/catalog", auth: true },
  { name: "ציון גמר", path: "/he/graduation", auth: true },
  { name: "תקנון", path: "/he/regulations", auth: true },
  { name: "תיק אקדמי", path: "/he/record", auth: true },
];

/** נמדד בתוך הדפדפן: כל צומת טקסט נראה, הצבע שלו והרקע האפקטיבי מאחוריו. */
const PROBE = () => {
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
  const ratio = (a, b) => {
    const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  /**
   * המרת כל תחביר צבע ל-sRGB דרך קנבס.
   *
   * אסור לפרסר `rgb(...)` ביד: Chrome מחזיר `oklab(...)` ו-`lab(...)` לכל
   * צבע שנגזר מ-color-mix או מטוקן oklch — וכל אלה קיימים אצלנו
   * (--discipline-* ב-oklch, bg-foreground/90 ב-color-mix). פרסר שמכיר רק
   * rgb מחזיר null, הרקע נופל לברירת מחדל, והתוצאה 1:1 מזויפת.
   * הקנבס נותן לדפדפן להמיר בעצמו — הוא היחיד שיודע.
   */
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const parse = (s) => {
    if (!s || s === "transparent" || s === "none") return null;
    cx.clearRect(0, 0, 1, 1);
    try {
      cx.fillStyle = s;
    } catch {
      return null;
    }
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 };
  };
  /** הרקע האפקטיבי: מטפסים במעלה העץ עד לרקע אטום, וממזגים שכבות. */
  const bgOf = (el) => {
    let node = el;
    const stack = [];
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    // ברירת מחדל לפי הערכה בפועל — לא קנבס בהיר קשיח. אם מטפסים עד השורש
    // בלי למצוא רקע אטום, ההנחה הלא־נכונה הופכת כל מדידה בכהה לשקר.
    let out = document.documentElement.classList.contains("dark")
      ? [11, 11, 15]
      : [252, 252, 253];
    for (let i = stack.length - 1; i >= 0; i--) {
      const { rgb, a } = stack[i];
      out = out.map((v, j) => Math.round(rgb[j] * a + v * (1 - a)));
    }
    return out;
  };

  const fails = [];
  let checked = 0;
  // תגים שהתוכן שלהם אינו טקסט לקריאה. בלי זה, ה-flight data של Next.js
  // בתוך <script> נספר כאלמנט טקסט ומדווח ככשל — קרה, ונראה כמו באג אמיתי.
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "HEAD", "META", "LINK"]);
  for (const el of document.querySelectorAll("*")) {
    if (SKIP.has(el.tagName)) continue;
    // רק אלמנטים שמחזיקים טקסט משלהם
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (own.length < 2) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (parseFloat(cs.opacity) < 0.15) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const blended = fg.rgb.map((v, i) => Math.round(v * fg.a + bg[i] * (1 - fg.a)));

    const px = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    // WCAG: טקסט "גדול" = ≥24px, או ≥18.66px ובולד. אחרת 4.5:1.
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(blended, bg);
    checked++;
    if (r < need) {
      fails.push({
        text: own.slice(0, 46),
        ratio: Number(r.toFixed(2)),
        need,
        px: Number(px.toFixed(1)),
        weight,
        cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 70),
      });
    }
  }
  return { checked, fails };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: MOBILE ? { width: 375, height: 812 } : { width: 1440, height: 900 },
  isMobile: MOBILE,
  hasTouch: MOBILE,
  locale: "he-IL",
  colorScheme: SCHEME,
});
const page = await ctx.newPage();

console.log(`בודק מול ${BASE} · מצב ${SCHEME === "dark" ? "כהה" : "בהיר"} · ${MOBILE ? "375px" : "1440px"} · WCAG AA\n`);
// סקריפט האתחול ב-layout.tsx קורא localStorage ואז כותב class על <html>.
// prefers-color-scheme לבדו לא מספיק כשיש העדפה שמורה, אז כופים אותה.
await ctx.addInitScript((scheme) => {
  try {
    localStorage.setItem("pakam-ui", JSON.stringify({ state: { theme: scheme } }));
  } catch {}
}, SCHEME);
await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
const login = await page.request.post(`${BASE}/api/auth/demo-login`);
console.log(`כניסת דמו → ${login.status()}\n`);

let totalChecked = 0;
let totalFails = 0;

for (const p of PAGES) {
  try {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500);
    // ה-overlay של Next בפיתוח נספר כטקסט ומסתיר תוכן — הוא לא חלק מהמוצר.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    if (p.auth && /\/login/.test(page.url())) {
      console.log(`${p.name.padEnd(12)} — הופנה להתחברות, מדלג`);
      continue;
    }
    const applied = await page.evaluate(() =>
      document.documentElement.classList.contains("dark") ? "dark" : "light");
    if (applied !== SCHEME) {
      console.log(`⚠️  ${p.name} — התבקש ${SCHEME} אבל הוחל ${applied}. המדידה לא תקפה.`);
      continue;
    }
    const { checked, fails } = await page.evaluate(PROBE);
    totalChecked += checked;
    totalFails += fails.length;
    const mark = fails.length === 0 ? "✅" : "❌";
    console.log(`${mark} ${p.name.padEnd(12)} ${String(checked).padStart(4)} אלמנטים · ${fails.length} כשלים`);
    for (const f of fails.slice(0, 6)) {
      console.log(`     ${f.ratio}:1 (דרוש ${f.need}) ${f.px}px/${f.weight} — "${f.text}"`);
      if (f.cls) console.log(`       ${f.cls}`);
    }
    if (fails.length > 6) console.log(`     … ועוד ${fails.length - 6}`);
  } catch (err) {
    console.log(`⚠️  ${p.name} — ${err.message.split("\n")[0]}`);
  }
}

await browser.close();
console.log(`\nסה"כ: ${totalChecked} אלמנטים · ${totalFails} כשלים`);
process.exit(totalFails === 0 ? 0 : 1);
