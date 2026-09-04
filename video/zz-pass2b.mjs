import { chromium } from "playwright";
const OUT="/private/tmp/claude-502/-Users-Ariel----------------6-----------------------/0e4fb0f3-f1be-4ee8-875b-02173d94910a/scratchpad/pass2";
const BASE="https://pakam-strategist.vercel.app";
const say=(m)=>console.log(m);
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
p.on("response",r=>{if(r.status()>=400&&r.url().includes("/api/"))say(`   ⚠️ [HTTP ${r.status()}] ${r.url().replace(BASE,"").slice(0,80)}`);});

await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.waitForFunction(()=>document.body.innerText.length>900, null,{timeout:60000});
await p.waitForTimeout(4000);
say("✅ חזרתי — הטיוטה של האשף אמורה לשחזר את הגיליון");
say(`   מסך: ${(await p.locator("body").innerText()).replace(/\n+/g," | ").slice(120,420)}`);

// "נכון — המשיכו מכאן"
const ok=p.getByRole("button",{name:/נכון — המשיכו/}).first();
if(await ok.count()){await ok.click();await p.waitForTimeout(5000);say("✅ אישרתי את הגיליון");}
else {say("❌ לא נמצא 'נכון — המשיכו מכאן'"); await p.screenshot({path:`${OUT}/04-lost.png`}); await b.close(); process.exit(0);}
await p.screenshot({path:`${OUT}/04-profile.png`,fullPage:true});
const t=await p.locator("body").innerText();
say(`   הפרופיל: ${t.replace(/\n+/g," | ").slice(150,900)}`);
await b.close();
