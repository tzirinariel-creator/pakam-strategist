import { chromium } from "playwright";
const OUT="/private/tmp/claude-502/-Users-Ariel----------------6-----------------------/0e4fb0f3-f1be-4ee8-875b-02173d94910a/scratchpad/pass2";
const BASE="https://pakam-strategist.vercel.app";
const F=[]; const say=console.log;
const note=(m)=>{F.push(m);say("   🔎 "+m);};
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem",acceptDownloads:true});
const p=await ctx.newPage();
p.on("response",r=>{if(r.status()>=400&&r.url().includes("/api/"))note(`HTTP ${r.status()} · ${r.url().replace(BASE,"").slice(0,70)}`);});
p.on("pageerror",e=>note(`page error: ${String(e).slice(0,110)}`));
const T=async()=>(await p.locator("body").innerText()).replace(/\n+/g," | ");

await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.waitForFunction(()=>document.body.innerText.length>900,{timeout:60000});
await p.waitForTimeout(3500);

// ── אשף מלא עם הגיליון ──
const go=p.getByRole("button",{name:/בואו נתחיל/}).first();
if(await go.count()){await go.click();await p.waitForTimeout(3000);}
await p.locator('text=/כבר יש לכם ש/').first().click(); await p.waitForTimeout(4000);
await p.locator('input[type=file]').first().setInputFiles(`${OUT}/sheet.png`);
await p.waitForFunction(()=>/קראנו \d+ קורסים/.test(document.body.innerText),{timeout:120000});
await p.getByRole("button",{name:/נכון — המשיכו/}).first().click();
await p.waitForTimeout(6000);
say("✅ גיליון אושר");

// פרופיל: לשון זכר + מיקוד כלכלה
const male=p.getByRole("button",{name:"לשון זכר"}).first();
if(await male.count()) await male.click();
const econ=p.getByRole("button",{name:"כלכלה",exact:true}).first();
if(await econ.count()) await econ.click();
await p.waitForTimeout(1200);
const nx=p.getByRole("button",{name:/^הבא$/}).first();
if(await nx.count()&&await nx.isEnabled()){await nx.click();await p.waitForTimeout(11000);say("✅ עברתי לתכנון");}

// שמירה
const fin=p.getByRole("button",{name:/סיום ושמירה/}).first();
if(await fin.count()){
  await fin.click();
  await p.waitForFunction(()=>!/שלב \d מתוך/.test(document.body.innerText),{timeout:120000}).catch(()=>note("השמירה לא הסתיימה בזמן"));
  await p.waitForTimeout(9000);
  say("✅ התוכנית נשמרה");
} else note("לא נמצא 'סיום ושמירה'");
await p.screenshot({path:`${OUT}/p3b-dashboard.png`,fullPage:true});
const d=await T();
say("   דף הבית: "+d.slice(150,700));
await b.close();
say("\n──── ממצאים ────\n"+(F.length?F.map(f=>"• "+f).join("\n"):"אין"));
