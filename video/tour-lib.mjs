// ============================================================
// תשתית הסיור: נכנס כמשתמש, מצלם כל מצב, ומדווח מה נמצא
// ============================================================
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

export const BASE = "https://pakam-strategist.vercel.app";
export const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url));

export async function openApp({ width = 1440, height = 1000, mobile = false } = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: true,
    ...(mobile && {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    }),
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text().slice(0, 160)); });
  return { b, ctx, p, errors };
}

export async function login(p, email = "test@pakamon.dev", pass = "test123456") {
  await p.goto(`${BASE}/he/login`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /התחברות עם דוא/ }).click();
  await p.locator("input[type=email]").fill(email);
  await p.locator("input[type=password]").fill(pass);
  await p.locator("button[type=submit]").click();
  await p.waitForURL(/dashboard|onboard/, { timeout: 60000 });
  await p.waitForTimeout(3000);
}

let n = 0;
export async function shot(p, name, { full = false } = {}) {
  n += 1;
  const file = `${SHOTS}${String(n).padStart(3, "0")}-${name}.png`;
  await p.screenshot({ path: file, fullPage: full });
  return file;
}

/** מדידות שלא נראות בצילום: גלישה, טקסט חתוך, יעדי מגע קטנים */
export async function measure(p) {
  return p.evaluate(() => {
    const out = { overflowX: false, clipped: [], tinyTargets: [], tinyText: [] };
    const de = document.documentElement;
    out.overflowX = de.scrollWidth > de.clientWidth + 2;
    for (const el of document.querySelectorAll("button,a,[role=button],[role=tab],input,select")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 24 || r.width < 24) {
        const t = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30);
        if (t) out.tinyTargets.push(`${Math.round(r.width)}×${Math.round(r.height)} "${t}"`);
      }
      const name = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
      if (!name && el.tagName !== "INPUT" && el.tagName !== "SELECT")
        out.tinyTargets.push(`ללא שם נגיש: <${el.tagName.toLowerCase()}>`);
    }
    for (const el of document.querySelectorAll("p,span,div,h1,h2,h3,td,li")) {
      if (el.children.length) continue;
      const txt = (el.innerText || "").trim();
      if (!txt) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "auto")
        out.clipped.push(txt.slice(0, 45));
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12 && txt.length > 25) out.tinyText.push(`${fs}px "${txt.slice(0, 40)}"`);
    }
    out.tinyTargets = [...new Set(out.tinyTargets)].slice(0, 8);
    out.clipped = [...new Set(out.clipped)].slice(0, 6);
    out.tinyText = [...new Set(out.tinyText)].slice(0, 6);
    return out;
  });
}

export function report(label, m, errors) {
  const flags = [];
  if (m.overflowX) flags.push("⚠️ גלישה אופקית");
  if (m.clipped.length) flags.push(`⚠️ טקסט חתוך: ${m.clipped.join(" · ")}`);
  if (m.tinyTargets.length) flags.push(`⚠️ יעד קטן/ללא שם: ${m.tinyTargets.join(" · ")}`);
  if (m.tinyText.length) flags.push(`⚠️ משפט מתחת 12px: ${m.tinyText.join(" · ")}`);
  console.log(`${flags.length ? "⚠️ " : "✓ "}${label}`);
  for (const f of flags) console.log(`      ${f}`);
  if (errors.length) { console.log(`      ✗ JS: ${[...new Set(errors)].join(" | ")}`); errors.length = 0; }
}
