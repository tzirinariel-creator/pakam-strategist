import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle=async(ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle(5000);
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await settle();
const rows = async () => p.evaluate(()=>[...document.querySelectorAll("tbody tr")].map(r=>r.innerText.replace(/\s+/g," ").trim()));
console.log("לפני:      ", JSON.stringify(await rows()));
await p.getByRole("button",{name:/^מחקו את תשפ״ז/}).first().click();
await p.waitForTimeout(3000);
console.log("אחרי מחיקה:", JSON.stringify(await rows()));
// **בלי** ללחוץ שמירה — רק רענון
await p.reload({waitUntil:"networkidle"}); await settle();
console.log("אחרי רענון:", JSON.stringify(await rows()));
console.log(await shot(p,"miluim-del2",{full:true}));
await b.close();
