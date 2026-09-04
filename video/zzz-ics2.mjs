import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const settle = async (ms=8000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle(5000);
await p.goto(`${BASE}/he/planner/semester`,{waitUntil:"networkidle"}); await settle();
const btn = p.locator("button").filter({ hasText: /הורדת קובץ יומן/ }).first();
await btn.scrollIntoViewIfNeeded();
// האם ה-handler בכלל רץ? נתלה על יצירת ה-blob
await p.evaluate(() => {
  window.__ics = { created: 0, revoked: 0, clicks: 0 };
  const co = URL.createObjectURL.bind(URL), ro = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__ics.created++; window.__ics.size = b.size; window.__ics.type = b.type; return co(b); };
  URL.revokeObjectURL = (u) => { window.__ics.revoked++; return ro(u); };
  document.addEventListener("click", (e) => { if (e.target?.tagName === "A" && e.target.download) window.__ics.clicks++; }, true);
});
const dl = p.waitForEvent("download", { timeout: 25000 }).catch(() => null);
await btn.click();
await p.waitForTimeout(4000);
const file = await dl;
const st = await p.evaluate(() => window.__ics);
const toast = (await p.locator("body").innerText()).match(/[^.]{0,60}(ירד|הורד|נוצר)[^.]{0,40}/);
console.log("מצב הדפדפן:", JSON.stringify(st));
console.log("אירוע הורדה:", file ? `✅ ${file.suggestedFilename()}` : "❌ לא נורה");
console.log("הודעה על המסך:", toast ? toast[0].trim() : "(אין)");
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
console.log(await shot(p, "ics-probe"));
await b.close();
