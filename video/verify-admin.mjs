// ============================================================
// אימות לוח הבקרה — שלושה רוחבים, שני מצבי צבע, ומדידות אמת
// ============================================================
import { chromium } from "playwright";
import { openApp, login, BASE } from "./tour-lib.mjs";

const VIEWS = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "tablet", width: 768, height: 1100 },
  { name: "mobile", width: 390, height: 900 },
];

const b = await chromium.launch();
const problems = [];

for (const v of VIEWS) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({
      viewport: { width: v.width, height: v.height },
      locale: "he-IL", timezoneId: "Asia/Jerusalem", colorScheme: scheme,
      isMobile: v.width < 768, hasTouch: v.width < 768,
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));
    p.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text().slice(0, 160)); });

    await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
    await p.goto(`${BASE}/he/admin`, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.body.innerText.includes("לוח הבקרה"), null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(6000);

    const tag = `admin-${v.name}-${scheme}`;
    await p.screenshot({ path: `video/shots/${tag}.png`, fullPage: true });

    // ── מדידות שלא נראות בצילום ──
    const m = await p.evaluate(() => {
      const out = { overflowX: false, tiny: [], clipped: [], noName: [], contrastRisk: [] };
      const de = document.documentElement;
      out.overflowX = de.scrollWidth > de.clientWidth + 2;
      for (const el of document.querySelectorAll("button,a,[role=button]")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 24 || r.width < 24) {
          const t = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30);
          out.tiny.push(`${Math.round(r.width)}×${Math.round(r.height)} "${t}"`);
        }
        const name = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
        if (!name) out.noName.push(`<${el.tagName.toLowerCase()}> ${el.className?.toString().slice(0, 50)}`);
      }
      // טקסט חתוך — מדלג על מיכלים שגוללים או חותכים בכוונה
      for (const el of document.querySelectorAll("p,span,div,h1,h2,h3,td,th,li")) {
        if (el.children.length) continue;
        const txt = (el.innerText || "").trim();
        if (!txt) continue;
        let contained = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX, oy = getComputedStyle(a).overflow;
          if (["auto", "scroll", "hidden", "clip"].includes(ox) || ["auto", "scroll", "hidden", "clip"].includes(oy)) { contained = true; break; }
        }
        if (!contained && el.scrollWidth > el.clientWidth + 2) out.clipped.push(txt.slice(0, 45));
      }
      out.tiny = [...new Set(out.tiny)].slice(0, 10);
      out.clipped = [...new Set(out.clipped)].slice(0, 8);
      out.noName = [...new Set(out.noName)].slice(0, 6);
      return out;
    });

    const txt = await p.evaluate(() => document.body.innerText);
    const missing = ["לוח הבקרה", "משתמשים רשומים", "משפך ההפעלה", "מה הם העלו", "בריאות המערכת", "הנרשמים האחרונים"]
      .filter((s) => !txt.includes(s));

    const line = `${v.name}/${scheme}`;
    console.log(`\n═══ ${line} ═══`);
    console.log(`  גלישה אופקית: ${m.overflowX ? "❌ יש" : "✅ אין"}`);
    console.log(`  מקטעים חסרים: ${missing.length ? "❌ " + missing.join(", ") : "✅ כולם"}`);
    console.log(`  יעדי מגע קטנים מ-24: ${m.tiny.length ? "❌ " + m.tiny.join(" · ") : "✅ אין"}`);
    console.log(`  טקסט חתוך: ${m.clipped.length ? "❌ " + m.clipped.join(" · ") : "✅ אין"}`);
    console.log(`  פקדים בלי שם נגיש: ${m.noName.length ? "❌ " + m.noName.join(" · ") : "✅ אין"}`);
    console.log(`  שגיאות JS: ${errors.length ? "❌ " + errors.slice(0, 3).join(" | ") : "✅ אין"}`);
    if (m.overflowX) problems.push(`${line}: גלישה אופקית`);
    if (missing.length) problems.push(`${line}: חסר ${missing.join(", ")}`);
    if (m.tiny.length) problems.push(`${line}: יעדי מגע ${m.tiny.join(", ")}`);
    if (m.clipped.length) problems.push(`${line}: חתוך ${m.clipped.join(", ")}`);
    if (m.noName.length) problems.push(`${line}: בלי שם נגיש ${m.noName.join(", ")}`);
    if (errors.length) problems.push(`${line}: JS ${errors[0]}`);

    if (v.name === "desktop" && scheme === "light") {
      console.log("\n--- הטקסט המלא ---\n" + txt.slice(0, 4200));
    }
    await ctx.close();
  }
}

console.log(`\n═══ ${problems.length === 0 ? "✅ נקי" : `❌ ${problems.length} ממצאים`} ═══`);
for (const x of problems) console.log("  · " + x);
await b.close();
