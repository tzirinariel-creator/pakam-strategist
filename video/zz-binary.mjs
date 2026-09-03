import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,120)));
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});

// ---- מוסיף מילואים לתשפ״ז דרך הממשק (מה שקודם היה בלתי אפשרי) ----
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await p.waitForTimeout(6000);
const sels=p.locator("select");
await sels.nth(0).selectOption({label:"תשפ״ז"}).catch(e=>console.log("שנה:",String(e).slice(0,60)));
await sels.nth(1).selectOption({label:"א׳"}).catch(()=>{});
const days=p.locator('input[type=number]').first();
await days.fill("40");
// תפקיד לחימה
const combat=p.locator('input[type=checkbox]').first();
if(await combat.count()) await combat.check().catch(()=>{});
await p.getByRole("button",{name:/^הוסיפו סמסטר$/}).first().click();
await p.waitForTimeout(6000);
let t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
console.log("=== אחרי הוספת תשפ״ז · א׳ · 40 ימים ===");
let i=t.indexOf("השירות שלכם בתואר"); console.log(t.slice(i,i+560));
i=t.indexOf("המרות בינארי"); console.log("\n=== כרטיס הבינארי עכשיו ===\n", t.slice(i,i+420));
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
