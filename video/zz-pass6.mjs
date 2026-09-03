import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem",acceptDownloads:true});
const p=await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,140)));
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.goto(`${BASE}/he/exam-planner`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
const btns=async()=>p.evaluate(()=>[...document.querySelectorAll("button")].map(x=>x.innerText.trim().replace(/\n/g," ")).filter(x=>x&&x.length<45));
const ok=await p.getByRole("button",{name:"הבנתי"}).first(); if(await ok.count()) { await ok.click(); await p.waitForTimeout(1200); }
// בוחר מועד א׳ לכל קורס
for (let i=0;i<6;i++){
  const a=p.getByRole("button",{name:/^מועד א׳ מומלץ/}).first();
  if(!(await a.count())) break;
  await a.click().catch(()=>{}); await p.waitForTimeout(900);
}
console.log("אחרי בחירת מועדים:", JSON.stringify(await btns()));
// לוחץ הבא עד שנגמר
for(let s=0;s<6;s++){
  const n=p.getByRole("button",{name:/^הבא$|^סיום|^שמור|^המשך/}).first();
  if(!(await n.count())) break;
  const label=(await n.innerText()).trim();
  await n.click().catch(()=>{}); await p.waitForTimeout(3000);
  const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
  console.log(`\n--- אחרי "${label}" (שלב ${s+1}) ---`);
  console.log(t.slice(0,900));
  console.log("כפתורים:", JSON.stringify(await btns()));
}
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
