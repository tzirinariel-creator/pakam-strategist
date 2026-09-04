import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle=async(ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle(5000);
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await settle();
const n = async () => p.locator("tbody tr").count();
// מוסיפים שורה כדי שיהיה מה למחוק
const sels=p.locator("select");
await sels.nth(0).selectOption({label:"תשפ״ז"}).catch(()=>{});
await sels.nth(1).selectOption({label:"ב׳"}).catch(()=>{});
await p.locator('input[type="number"]').first().fill("12");
await p.waitForTimeout(400);
await p.getByRole("button",{name:/^הוסיפו סמסטר$/}).first().click();
await p.waitForTimeout(1200);
await p.getByRole("button",{name:/^שמירת מילואים$/}).first().click();
await p.waitForTimeout(7000);
console.log("אחרי הוספה:", await n(), "שורות");
const before = await n();
const del = p.getByRole("button",{name:/^מחקו את תשפ״ז ב׳$/}).first();
console.log("כפתור המחיקה:", await del.count()?"נמצא":"לא נמצא");
const t0=Date.now();
await del.click();
for (let i=0;i<12;i++){
  await p.waitForTimeout(1000);
  const c=await n();
  if (c<before){ console.log(`✅ המסך התעדכן אחרי ${((Date.now()-t0)/1000).toFixed(1)}s — ${before} → ${c}`); break; }
  if (i===11) console.log(`❌ 12 שניות והמסך עדיין מציג ${c} שורות`);
}
const err=(await p.locator("body").innerText()).match(/המחיקה לא הצליחה[^.]*/);
console.log("הודעת שגיאה:", err?err[0]:"אין");
console.log(await shot(p,"miluim-del3"));
await b.close();
