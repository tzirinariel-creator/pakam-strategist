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
const btns=async()=>p.evaluate(()=>[...document.querySelectorAll("button")].map(x=>x.innerText.trim().replace(/\n/g," ")).filter(x=>x&&x.length<50));
const ok=p.getByRole("button",{name:"הבנתי"}).first(); if(await ok.count()){await ok.click();await p.waitForTimeout(1000);}
for(let i=0;i<8;i++){ const a=p.getByRole("button",{name:/^מועד [אב]׳( מומלץ)? \d/}).nth(i*2);
  if(!(await a.count()))break; await a.click().catch(()=>{}); await p.waitForTimeout(700); }
for(let s=0;s<4;s++){ const n=p.getByRole("button",{name:/^הבא$/}).first();
  if(!(await n.count()))break; await n.click().catch(()=>{}); await p.waitForTimeout(2500); }
const build=p.getByRole("button",{name:/בנה לי תוכנית/}).first();
if(await build.count()){ await build.click(); await p.waitForTimeout(9000); }
const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
console.log("=== אחרי בניית התוכנית ===");
console.log(t.slice(0,1600));
console.log("\nכפתורים:", JSON.stringify(await btns()));
// --- ייצוא ---
const share=p.getByRole("button",{name:/שיתוף|ייצוא|הורד|אקסל|xlsx|שתפו/i}).first();
console.log("\n=== ייצוא ===");
if(await share.count()){
  await share.click(); await p.waitForTimeout(2500);
  console.log("תפריט:", JSON.stringify(await btns()));
  const x=p.getByRole("button",{name:/אקסל|xlsx/i}).first();
  if(await x.count()){
    const [d]=await Promise.all([p.waitForEvent("download",{timeout:25000}).catch(()=>null), x.click()]);
    if(d){ const fn=d.suggestedFilename(); await d.saveAs("/tmp/"+fn); console.log("✓ ירד:", fn); }
    else console.log("✗ לא ירד קובץ");
  } else console.log("אין פריט אקסל בתפריט");
} else console.log("✗ אין כפתור ייצוא גם אחרי בניית התוכנית");
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
