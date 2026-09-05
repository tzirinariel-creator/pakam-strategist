// צילום לוח הבקרה — מתחבר כאריאל (מנהל) ומצלם.
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
const BASE = process.env.ADMIN_BASE ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
const PASS = process.env.ADMIN_PASS ?? process.env.TEST_USER_PASSWORD;
const WIDTH = Number(process.env.W ?? 1440);
const DARK = process.env.DARK === "1";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
if (!res.ok) { console.error("התחברות נכשלה:", res.status, (await res.text()).slice(0, 200)); process.exit(1); }
const session = await res.json();
const ref = new URL(url).hostname.split(".")[0];
const raw = "base64-" + Buffer.from(JSON.stringify(session), "utf-8").toString("base64");
const CHUNK = 3180; const cookies = [];
if (raw.length <= CHUNK) cookies.push({ name: `sb-${ref}-auth-token`, value: raw });
else for (let i = 0, k = 0; i < raw.length; i += CHUNK, k++) cookies.push({ name: `sb-${ref}-auth-token.${k}`, value: raw.slice(i, i + CHUNK) });

const b = await chromium.launch();
const host = new URL(BASE).hostname;
const ctx = await b.newContext({ viewport: { width: WIDTH, height: 1000 }, locale: "he-IL", timezoneId: "Asia/Jerusalem",
  colorScheme: DARK ? "dark" : "light" });
await ctx.addCookies(cookies.map((c) => ({ ...c, domain: host, path: "/", httpOnly: false, secure: BASE.startsWith("https"), sameSite: "Lax" })));
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text().slice(0, 200)); });

const target = process.env.PATHNAME ?? "/he/admin";
await p.goto(`${BASE}${target}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForFunction(() => document.body.innerText.length > 800, null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(Number(process.env.SETTLE ?? 6000));
const name = process.env.SHOT ?? "admin";
await p.screenshot({ path: `video/shots/${name}.png`, fullPage: process.env.FULL !== "0" });
console.log("URL:", p.url());
console.log((await p.evaluate(() => document.body.innerText)).slice(0, Number(process.env.CHARS ?? 3000)));
console.log("\n=== שגיאות ===", errors.slice(0, 8).join("\n") || "אין");
await b.close();
