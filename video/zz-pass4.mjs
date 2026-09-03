import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem",acceptDownloads:true});
const p=await ctx.newPage();
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,120));});
const T=async()=>(await p.locator("body").innerText()).replace(/\n+/g," | ");
async function go(path,label){
  await p.goto(`${BASE}${path}`,{waitUntil:"networkidle"});
  await p.waitForTimeout(5000);
  const t=await T();
  console.log(`\n===== ${label}  (${path}) =====`);
  console.log(t.slice(0,1500));
  return t;
}
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.waitForTimeout(4000);
console.log("התחברתי ✓");

await go("/he/exam-planner","תקופת מבחנים — המתכנן");
await go("/he/exam","לוח המבחנים");
await go("/he/graduation","סיום התואר + סימולציה");
await go("/he/record","גיליון + יועץ בינארי");
await go("/he/miluim","מילואים");
await go("/he/planner","הלוח — חזרה אליו");
console.log("\n===== שגיאות קונסול =====");
console.log(errs.length? [...new Set(errs)].join("\n") : "אין");
await b.close();
