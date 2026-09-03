import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},locale:"he-IL",timezoneId:"Asia/Jerusalem",isMobile:true,hasTouch:true,
  userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"});
const p=await ctx.newPage();
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
await p.goto(`${BASE}/he/planner`,{waitUntil:"networkidle"}); await p.waitForTimeout(8000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const btns=[...document.querySelectorAll("button")].filter(x=>/^[אב]׳$/.test(x.innerText.trim()));
  return btns.map(x=>({
    label:x.innerText.trim(),
    ariaPressed:x.getAttribute("aria-pressed"),
    ariaSelected:x.getAttribute("aria-selected"),
    ariaCurrent:x.getAttribute("aria-current"),
    dataState:x.getAttribute("data-state"),
    cls:x.className.slice(0,110),
    bg:getComputedStyle(x).backgroundColor,
    color:getComputedStyle(x).color,
  }));
}),null,1));
// גם: מה כתוב באזור מערכת השעות
const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
const i=t.indexOf("מערכת השעות שלכם");
console.log("\nאזור מערכת השעות:", t.slice(i,i+260));
// ואחרי לחיצה על א׳
const a=p.locator("button").filter({hasText:/^א׳$/}).first();
if(await a.count()){ await a.click(); await p.waitForTimeout(3000);
  const t2=(await p.locator("body").innerText()).replace(/\n+/g," | ");
  const j=t2.indexOf("מערכת השעות שלכם");
  console.log("\nאחרי לחיצה על א׳:", t2.slice(j,j+260)); }
await b.close();
