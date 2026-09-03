import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,140)));
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000}); await p.waitForTimeout(5000);
const king=p.getByRole("button",{name:/המלך הפילוסוף/}).first();
await king.click(); await p.waitForTimeout(3500);
await p.waitForTimeout(2500);
console.log("אחרי פתיחת המלך — שדות:", await p.evaluate(()=>({
  textarea: document.querySelectorAll("textarea").length,
  inputs: [...document.querySelectorAll("input")].map(i=>i.type+":"+(i.placeholder||"")),
  buttons: [...document.querySelectorAll("button")].map(b=>b.innerText.trim()).filter(x=>x&&x.length<40).slice(0,25),
})));
const box=p.locator('textarea, input:not([type=checkbox]):not([type=radio])').last();
await box.click({timeout:15000}).catch(()=>{});
await box.fill("מה שמרתי בתוכנית שלי לסמסטר הקרוב?",{timeout:15000});
await p.keyboard.press("Enter");
console.log("שאלתי. ממתין לתשובה…");
await p.waitForTimeout(40000);
const t=(await p.locator("body").innerText()).replace(/\n{2,}/g,"\n");
const i=t.indexOf("איזה קורסים כדאי לי");
console.log("=== התשובה של המלך ===");
console.log(i>=0? t.slice(i,i+2200) : t.slice(-2200));
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
