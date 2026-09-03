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
await p.waitForURL(/dashboard/,{timeout:45000}); await p.waitForTimeout(7000);
const T=async()=>(await p.locator("body").innerText()).replace(/\n+/g," | ");
let t=await T();
console.log("=== דף הבית · שנה ג׳ ===");
console.log(t.slice(0,1200));
for (const [path,label] of [["/he/planner","הלוח"],["/he/miluim","מילואים"],["/he/bidding","בידינג"],["/he/graduation","סיום התואר"]]) {
  await p.goto(`${BASE}${path}`,{waitUntil:"networkidle"}); await p.waitForTimeout(5500);
  t=await T();
  console.log(`\n===== ${label} =====`);
  console.log(t.slice(t.indexOf("החלטות גדולות.")+16, t.indexOf("החלטות גדולות.")+1400));
}
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
