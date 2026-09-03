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

// 1) המילואים — הרשימה אחרי התיקון
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
const sel=await p.evaluate(()=>[...document.querySelectorAll("select")].map(s=>[...s.options].map(o=>o.textContent.trim())));
console.log("=== בוררי מילואים אחרי התיקון ===", JSON.stringify(sel));

// 2) להזין סמסטר מילואים בפועל
const selects=p.locator("select");
await selects.nth(0).selectOption({index:0}).catch(()=>{});
const daysInput=p.locator('input[type=number]').first();
if(await daysInput.count()){ await daysInput.fill("45"); }
const add=p.getByRole("button",{name:/^הוסיפו סמסטר$/}).first();
if(await add.count()){ await add.click(); await p.waitForTimeout(5000); }
let t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
console.log("\n=== אחרי הוספת 45 ימי מילואים ===");
const i=t.indexOf("השירות שלכם בתואר");
console.log(t.slice(i,i+1100));

// 3) המרות בינארי
const j=t.indexOf("המרות בינארי");
console.log("\n=== בינארי ===", j>=0? t.slice(j,j+600):"—");
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
