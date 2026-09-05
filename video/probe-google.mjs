import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp();
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
const r = await p.evaluate(async () => {
  const res = await fetch("/api/google/auth", { redirect: "manual" });
  return { status: res.status, type: res.type, loc: res.headers.get("location") };
});
console.log("fetch(manual):", JSON.stringify(r));
// ניווט אמיתי — כדי לראות לאן הדפדפן באמת מגיע
await p.goto(`${BASE}/api/google/auth`, { waitUntil: "domcontentloaded" }).catch((e) => console.log("nav err", String(e).slice(0,120)));
await p.waitForTimeout(3000);
console.log("URL אחרי ניווט:", p.url());
const u = new URL(p.url());
if (u.searchParams.get("redirect_uri")) console.log("redirect_uri שנשלח:", JSON.stringify(u.searchParams.get("redirect_uri")));
const txt = await p.evaluate(() => document.body.innerText.slice(0, 700));
console.log("--- מה שהעמוד מציג ---\n" + txt);
await b.close();
