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
const visit=async(path,label,waitFor)=>{
  await p.goto(`${BASE}${path}`,{waitUntil:"domcontentloaded"});
  try{ await p.waitForFunction(()=>document.body.innerText.length>800,{timeout:45000}); }catch{}
  await p.waitForTimeout(4000);
  const t=await T();
  say(`\n══ ${label} (${path})`);
  say("   "+t.slice(150,600));
  if(waitFor && !new RegExp(waitFor).test(t)) note(`${label}: לא נמצא "${waitFor}"`);
  await p.screenshot({path:`${OUT}/p3-${label.replace(/[^\w]/g,"_")}.png`,fullPage:true});
  return t;
};

await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.waitForTimeout(6000);
say("✅ מחובר (החשבון כבר עם גיליון שנה א׳ מהמעבר הקודם)");

await visit("/he/planner","תכנון התואר","תכנון התואר");
await visit("/he/bidding","בידינג","מקצה");
await visit("/he/record","התיק האקדמי");
await visit("/he/graduation","מחשבון ציון גמר","ציון גמר");
await visit("/he/exam-planner","תכנון מבחנים");
await visit("/he/exam","לוח בחינות");
await visit("/he/calendar","יומן");
await visit("/he/regulations","דרישות התואר");
await visit("/he/catalog","קטלוג");
await visit("/he/lineage","השושלת");
await visit("/he/miluim","מילואים","מילואים");
await visit("/he/settings","הגדרות");
await visit("/he/guide","מדריך מתחיל");

await b.close();
say("\n──── ממצאים ────");
say(F.length?F.map(f=>"• "+f).join("\n"):"אין");
