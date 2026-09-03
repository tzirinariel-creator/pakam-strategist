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
const info=await p.evaluate(()=>{
  const findText=(s)=>[...document.querySelectorAll("*")].filter(e=>e.children.length===0&&e.textContent.trim()===s);
  const box=(e)=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),vis:r.width>0&&r.height>0};};
  const a=findText("סמסטר א׳").map(box), bb=findText("סמסטר ב׳").map(box);
  return {
    semA:a, semB:bb,
    tabs:[...document.querySelectorAll('[role=tab],[role=tablist]')].length,
    switchers:[...document.querySelectorAll("button")].map(x=>x.innerText.trim()).filter(x=>/סמסטר|שנה [אבג]/.test(x)).slice(0,8),
    docH:document.documentElement.scrollHeight,
  };
});
console.log(JSON.stringify(info,null,1));
await p.screenshot({path:"/tmp/planner-mobile.png",fullPage:false});
console.log("צילום: /tmp/planner-mobile.png");
await b.close();
