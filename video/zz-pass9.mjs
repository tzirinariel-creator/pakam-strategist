import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,140)));
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await p.waitForTimeout(6000);
const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
for (const k of ["המרות בינארי","עדכון ימי-המילואים של"]) {
  const i=t.indexOf(k); console.log(`\n### ${k}\n`, i>=0? t.slice(i,i+340):"—");
}
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
