import { chromium } from "playwright";
const OUT="/private/tmp/claude-502/-Users-Ariel----------------6-----------------------/0e4fb0f3-f1be-4ee8-875b-02173d94910a/scratchpad/pass2";
const BASE="https://pakam-strategist.vercel.app";
const say=(m)=>console.log(m);
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
p.on("response",r=>{if(r.status()>=400&&r.url().includes("/api/"))say(`   ⚠️ [HTTP ${r.status()}] ${r.url().replace(BASE,"").slice(0,80)}`);});
const settle=async(ms=3000)=>{await p.waitForTimeout(ms);};

await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.waitForFunction(()=>document.body.innerText.length>900, null,{timeout:60000});
await settle();
say("✅ התחברות");

// שלב 0 → נקודת פתיחה
const go=p.getByRole("button",{name:/בואו נתחיל/}).first();
if(await go.count()){await go.click();await settle();}
await p.screenshot({path:`${OUT}/01-standing.png`});

// "כבר יש לכם ש״ס"
const card=p.locator('text=/כבר יש לכם ש/').first();
if(await card.count()){await card.click();await settle(4000);say("✅ 'כבר יש לכם ש״ס'");}
else say("❌ הכרטיס לא נמצא");
await p.screenshot({path:`${OUT}/02-upload.png`,fullPage:true});
say(`   מסך: ${(await p.locator("body").innerText()).replace(/\n+/g," | ").slice(0,300)}`);

// העלאת הגיליון
const fi=p.locator('input[type=file]');
say(`   קלטי קובץ: ${await fi.count()}`);
if(await fi.count()){
  const t=Date.now();
  await fi.first().setInputFiles(`${OUT}/sheet.png`);
  say("⏳ סורק…");
  await p.waitForFunction(()=>/נמצאו|שורות|לא הצלחנו|אינו זמין|הסריקה/.test(document.body.innerText), null,{timeout:120000}).catch(()=>say("   (פסק זמן בהמתנה לתוצאה)"));
  say(`⏱  סריקה: ${((Date.now()-t)/1000).toFixed(1)}s`);
  await settle(3000);
  await p.screenshot({path:`${OUT}/03-scan-result.png`,fullPage:true});
  say(`   תוצאה: ${(await p.locator("body").innerText()).replace(/\n+/g," | ").slice(0,900)}`);
}
await b.close();
