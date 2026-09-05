// ============================================================
// מטריצת הגישה ללוח הבקרה — מי נכנס, ומי לא, בפרודקשן
// ============================================================
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
for (const f of [".env.local", ".env"]) {
  const path = fileURLToPath(new URL(`../${f}`, import.meta.url));
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}
const BASE = "https://pakam-strategist.vercel.app";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = new URL(SB).hostname.split(".")[0];

async function cookiesFor(email, pass) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!r.ok) return null;
  const s = await r.json();
  const raw = "base64-" + Buffer.from(JSON.stringify(s), "utf-8").toString("base64");
  const CH = 3180; const out = [];
  if (raw.length <= CH) out.push({ name: `sb-${ref}-auth-token`, value: raw });
  else for (let i = 0, k = 0; i < raw.length; i += CH, k++) out.push({ name: `sb-${ref}-auth-token.${k}`, value: raw.slice(i, i + CH) });
  return out.map((c) => ({ ...c, domain: new URL(BASE).hostname, path: "/", httpOnly: false, secure: true, sameSite: "Lax" }));
}

const b = await chromium.launch();
const rows = [];

async function probe(label, email, pass) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
  if (email) {
    const c = await cookiesFor(email, pass);
    if (!c) { rows.push([label, "התחברות נכשלה", "—", "—"]); await ctx.close(); return; }
    await ctx.addCookies(c);
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/he/admin`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6500);
  const landed = p.url().replace(BASE, "");
  const leaked = await p.evaluate(() =>
    document.body.innerText.includes("משפך ההפעלה") || document.body.innerText.includes("הנרשמים האחרונים"));
  let api = "—";
  try {
    api = String(await p.evaluate(async () => {
      const r = await fetch(`/api/trpc/admin.getOverview?batch=1&input=${encodeURIComponent(JSON.stringify({0:{json:null,meta:{values:["undefined"]}}}))}`);
      return r.status;
    }));
  } catch { api = "n/a"; }
  rows.push([label, landed, leaked ? "❌ דלף" : "✅ לא דלף", api]);
  await ctx.close();
}

await probe("אורח (לא מחובר)", null, null);
await probe("חשבון הדמו", process.env.NEXT_PUBLIC_DEMO_USER_EMAIL, process.env.DEMO_USER_PASSWORD);
await probe("חשבון הבדיקה", process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

console.log("\n| מי | נחת ב | תוכן ניהולי | admin.getOverview |");
console.log("|---|---|---|---|");
for (const r of rows) console.log(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`);
await b.close();
