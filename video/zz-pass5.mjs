import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem",acceptDownloads:true});
const p=await ctx.newPage();
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,140));});
p.on("pageerror",e=>errs.push("PAGEERROR "+String(e).slice(0,140)));
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000}); await p.waitForTimeout(3000);

// ---------- 1. סימולציית ציונים ----------
await p.goto(`${BASE}/he/graduation`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
const simBtn = p.getByRole("button",{name:/סימולצ|בדקו|מה יקרה/}).first();
console.log("=== סימולציה ===");
if (await simBtn.count()) {
  await simBtn.click({timeout:8000}).catch(e=>console.log("קליק נכשל:",String(e).slice(0,80)));
  await p.waitForTimeout(3500);
  const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
  const i=t.indexOf("סימולצ");
  console.log(i>=0? t.slice(Math.max(0,i-200), i+900) : "לא נמצא טקסט סימולציה");
} else console.log("אין כפתור סימולציה");

// ---------- 2. תכנון מבחנים: לתכנן ולשמור ----------
console.log("\n=== תכנון מבחנים — פעולה ===");
await p.goto(`${BASE}/he/exam-planner`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
const before=(await p.locator("body").innerText()).length;
const buttons = await p.evaluate(()=>[...document.querySelectorAll("button")]
  .map(x=>x.innerText.trim().replace(/\n/g," ")).filter(x=>x&&x.length<40).slice(0,40));
console.log("כפתורים במסך:", JSON.stringify(buttons));
// ---------- 3. ייצוא ----------
const share = p.getByRole("button",{name:/שיתוף|ייצוא|הורד|אקסל|xlsx/i}).first();
if (await share.count()) {
  await share.click().catch(()=>{}); await p.waitForTimeout(2500);
  const t2=(await p.locator("body").innerText()).replace(/\n+/g," | ");
  const j=t2.search(/אקסל|xlsx|ics|יומן/);
  console.log("\nתפריט הייצוא:", j>=0? t2.slice(j-120,j+500):"—");
  const dl = await Promise.race([
    p.waitForEvent("download",{timeout:15000}).then(d=>d.suggestedFilename()),
    new Promise(r=>setTimeout(()=>r(null),15000))
  ]).catch(()=>null);
  const x = p.getByRole("button",{name:/אקסל|xlsx/i}).first();
  if(!dl && await x.count()){
    const [d]=await Promise.all([p.waitForEvent("download",{timeout:20000}).catch(()=>null), x.click()]);
    console.log("הורדה:", d? d.suggestedFilename():"לא ירדה");
  } else console.log("הורדה:", dl||"לא ירדה");
} else console.log("אין כפתור שיתוף/ייצוא");
console.log("\n=== שגיאות ==="); console.log(errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
