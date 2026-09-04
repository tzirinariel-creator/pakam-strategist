// ה-400 שראיתי בשמירת המילואים — אמיתי או רעש?
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle=async(ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
const bad=[];
p.on("response", async (r) => {
  if (r.status() < 400) return;
  let body=""; try { body=(await r.text()).slice(0,400); } catch {}
  bad.push(`HTTP ${r.status()} ${r.url().replace(BASE,"").slice(0,90)}\n      ${body}`);
});
await login(p); await settle(5000);
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await settle();
const d=p.locator('input[type="number"]').first();
await d.fill("35");
const cb=p.locator('input[type="checkbox"]').first();
if (await cb.count()) await cb.check().catch(()=>{});
await p.waitForTimeout(600);
await p.getByRole("button",{name:/^הוסיפו סמסטר$/}).first().click().catch(()=>{});
await p.waitForTimeout(2000);
await p.getByRole("button",{name:/^שמירת מילואים$/}).first().click().catch(()=>{});
await p.waitForTimeout(6000);
const t=(await p.locator("body").innerText()).replace(/\s+/g," ");
console.log("אחרי השמירה:", (t.match(/קבוצה [A-D]|נשמר|שגיאה|לא הצלחנו/g)||[]).join(" · ") || "(אין אינדיקציה)");
console.log("שורות בטבלה:", await p.locator("tbody tr").count());
console.log("\nתגובות ≥400:", bad.length ? bad.join("\n   ") : "אין");
console.log(await shot(p,"miluim-400",{full:true}));
await b.close();
