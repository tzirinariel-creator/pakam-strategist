import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const MAC_UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem",userAgent:MAC_UA});
const p=await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,120)));
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});
const T=async()=>(await p.locator("body").innerText()).replace(/\n+/g," | ");
const show=(t,k,n=300)=>{const i=t.indexOf(k);console.log(`  ${i>=0?"✓":"✗"} "${k}" → ${i>=0?t.slice(i,i+n):"לא נמצא"}`);return i>=0;};

console.log("=== 22-23 · הטקסט האישי בהגדרות ===");
await p.goto(`${BASE}/he/settings`,{waitUntil:"networkidle"}); await p.waitForTimeout(6000);
let t=await T();
show(t,"יש אותי",170);
console.log("\n=== 22-24 · התקנה כאפליקציה במק (UA של כרום במק) ===");
show(t,"פכמון כאפליקציה",320);

console.log("\n=== 195 · מצב הסימולציה ===");
await p.goto(`${BASE}/he/graduation`,{waitUntil:"networkidle"}); await p.waitForTimeout(6000);
t=await T(); show(t,"מה יקרה לממוצע אם",220);

console.log("\n=== P-א · שני הסמסטרים בנייד ===");
await p.setViewportSize({width:390,height:844});
await p.goto(`${BASE}/he/planner`,{waitUntil:"networkidle"}); await p.waitForTimeout(7000);
t=await T();
const semA=t.includes("סמסטר א׳"), semB=t.includes("סמסטר ב׳");
console.log(`  סמסטר א׳: ${semA?"✓":"✗"} · סמסטר ב׳: ${semB?"✓":"✗"}`);
const h=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
console.log(`  גלישה אופקית בנייד: ${h?"✗ יש":"✓ אין"}`);
const tabs=await p.evaluate(()=>[...document.querySelectorAll('[role=tab]')].map(x=>x.innerText.trim()).slice(0,8));
console.log("  טאבים:", JSON.stringify(tabs));
console.log("\n=== שגיאות ===", errs.length?[...new Set(errs)].join("\n"):"אין");
await b.close();
