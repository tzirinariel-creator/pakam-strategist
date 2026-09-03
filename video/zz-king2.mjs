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
await p.waitForURL(/dashboard/,{timeout:45000});
// --- מוסיף קורס דרך הממשק, כמו סטודנט ---
await p.goto(`${BASE}/he/planner`,{waitUntil:"networkidle"}); await p.waitForTimeout(6000);
const add=p.getByRole("button",{name:/^הוסיפו קורס$/}).first();
await add.click(); await p.waitForTimeout(3000);
const search=p.locator('input[type=text], input[type=search]').last();
await search.fill("סמינר"); await p.waitForTimeout(4000);
const opts=await p.evaluate(()=>[...document.querySelectorAll('[role=option],button,li')]
  .map(e=>e.innerText?.trim()).filter(x=>x&&x.includes("סמינר")&&x.length<90).slice(0,6));
console.log("תוצאות חיפוש:", JSON.stringify(opts));
const first=p.getByText(/סמינר/).nth(2);
await first.click({timeout:10000}).catch(e=>console.log("קליק:",String(e).slice(0,60)));
await p.waitForTimeout(4000);
const t0=(await p.locator("body").innerText()).replace(/\n+/g," | ");
const k=t0.indexOf("סמסטר א׳");
console.log("\n=== הלוח אחרי ההוספה ===", t0.slice(k,k+420));
// --- ושואל את המלך ---
await p.goto(`${BASE}/he/dashboard`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
await p.getByRole("button",{name:/המלך הפילוסוף/}).first().click(); await p.waitForTimeout(4000);
const box=p.locator('input[placeholder*="שאלה"]').last();
await box.fill("מה שמרתי בתוכנית שלי לסמסטר הקרוב?");
await p.keyboard.press("Enter"); await p.waitForTimeout(38000);
const t=(await p.locator("body").innerText()).replace(/\n{2,}/g,"\n");
const i=t.indexOf("מה שמרתי בתוכנית");
console.log("\n=== המלך ===\n", i>=0? t.slice(i,i+1300) : t.slice(-1300));
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
