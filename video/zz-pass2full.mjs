import { chromium } from "playwright";
const OUT="/private/tmp/claude-502/-Users-Ariel----------------6-----------------------/0e4fb0f3-f1be-4ee8-875b-02173d94910a/scratchpad/pass2";
const BASE="https://pakam-strategist.vercel.app";
const F=[];
const say=(m)=>{console.log(m);};
const note=(m)=>{F.push(m);console.log("   🔎 "+m);};
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
p.on("response",r=>{if(r.status()>=400&&r.url().includes("/api/"))note(`HTTP ${r.status()} על ${r.url().replace(BASE,"").slice(0,70)}`);});
const txt=async()=>(await p.locator("body").innerText()).replace(/\n+/g," | ");

await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.waitForFunction(()=>document.body.innerText.length>900,{timeout:60000});
await p.waitForTimeout(3500);

const go=p.getByRole("button",{name:/בואו נתחיל/}).first();
if(await go.count()){await go.click();await p.waitForTimeout(3000);}
const card=p.locator('text=/כבר יש לכם ש/').first();
await card.click(); await p.waitForTimeout(4000);
await p.locator('input[type=file]').first().setInputFiles(`${OUT}/sheet.png`);
await p.waitForFunction(()=>/קראנו \d+ קורסים/.test(document.body.innerText),{timeout:120000});
say("✅ 1 · הגיליון נסרק");

await p.getByRole("button",{name:/נכון — המשיכו/}).first().click();
await p.waitForTimeout(6000);
say("✅ 2 · אישרתי את הגיליון");
await p.screenshot({path:`${OUT}/04-profile.png`,fullPage:true});
const prof=await txt();
say(`   פרופיל: ${prof.slice(prof.indexOf("ספרו לנו")>0?prof.indexOf("ספרו לנו"):160, (prof.indexOf("ספרו לנו")>0?prof.indexOf("ספרו לנו"):160)+700)}`);

// אנגלית — מה נאמר?
const eng=prof.match(/רמה מוצהרת[^|]{0,90}|פטור[^|]{0,60}|אמירנט[^|]{0,80}/g);
note(`אנגלית במסך הפרופיל: ${eng? eng.slice(0,3).join(" ⁄ ") : "לא הוזכר"}`);
// איזו שנה נבחרה?
const yr=prof.match(/שנה [אבג]׳/g); note(`שנים שמופיעות: ${[...new Set(yr||[])].join(", ")}`);

const next=p.getByRole("button",{name:/^הבא$/}).first();
if(await next.count()&&await next.isEnabled()){await next.click();await p.waitForTimeout(9000);say("✅ 3 · עברתי לתכנון");}
await p.screenshot({path:`${OUT}/05-planner.png`,fullPage:true});
const pl=await txt();
const which=pl.match(/שנה [אבג]׳ · סמסטר [אב]׳|המערכת המומלצת[^|]{0,60}/g);
note(`הלוח נפתח על: ${[...new Set(which||[])].slice(0,3).join(" ⁄ ")}`);
const tabs=await p.locator('[role=tab]').allInnerTexts();
note(`טאבים: ${tabs.map(t=>t.replace(/\n/g," ")).join("  |  ")||"אין"}`);
await b.close();
console.log("\n──── ממצאים ────\n"+F.map(f=>"• "+f).join("\n"));
