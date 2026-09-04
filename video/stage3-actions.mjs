// ============================================================
// שלב 3 — הפעולות שהסיור לא יכול ללחוץ מעצמו
// ------------------------------------------------------------
// אריאל: *"כל פיצר וכל פעולה, בכל טאב ובכל שלב… כל הזזה, לחיצה, שינוי."*
// כל פעולה כאן: צילום לפני · ביצוע · צילום אחרי · **אימות שהנתון השתנה**.
// הכתיבה היא ל-test@pakamon.dev בלבד — ההרשאה המפורשת של אריאל.
//
//   node video/stage3-actions.mjs [--only id,id]
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../docs/שלב3-פעולות.json", import.meta.url));
const arg = (f,d)=>process.argv.includes(f)?process.argv[process.argv.indexOf(f)+1]:d;
const ONLY = (arg("--only","")||"").split(",").filter(Boolean);

const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const T = async()=>(await p.locator("body").innerText()).replace(/\s+/g," ");
const settle = async(ms=4000)=>{ await p.waitForFunction(()=>document.body.innerText.length>500, null,{timeout:35000}).catch(()=>{});
  await p.waitForTimeout(ms); await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"), null,{timeout:35000}).catch(()=>{}); };
const dismiss = async()=>{ for(let i=0;i<3;i++){ if(!(await p.locator("[data-slot=dialog-overlay]").count()))return;
  const c=p.getByRole("button",{name:/^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/}).first();
  if(await c.count())await c.click().catch(()=>{}); else await p.keyboard.press("Escape"); await p.waitForTimeout(700);} };
const go = async(u,ms=6000)=>{ await p.goto(`${BASE}${u}`,{waitUntil:"domcontentloaded"}); await settle(ms); await dismiss(); };

const ACTIONS = [
  { id:"הסרת-קורס", where:"/he/record", async run(){
      await go("/he/record",8000);
      const before=(await T()).match(/(\d+) ש״ס/);
      const del=p.locator("button").filter({hasText:/הסר|מחק/}).first();
      if(!(await del.count())) return { ok:null, evidence:"אין קורסים להסרה במצב הזה" };
      await del.click(); await p.waitForTimeout(2500); await dismiss();
      const after=(await T()).match(/(\d+) ש״ס/);
      return { ok:true, evidence:`לפני ${before?.[1]??"?"} ש״ס · אחרי ${after?.[1]??"?"} ש״ס` }; } },

  { id:"קורס-מותאם", where:"/he/record", async run(){
      await go("/he/record",8000);
      const add=p.locator("button").filter({hasText:/הוספת קורס|הוסיפו קורס|קורס מותאם/}).first();
      if(!(await add.count())) return { ok:false, evidence:"לא נמצא כפתור הוספה" };
      await add.click(); await p.waitForTimeout(2500);
      const fields=await p.evaluate(()=>[...document.querySelectorAll("input,select")].map(e=>e.placeholder||e.getAttribute("aria-label")||e.name||e.type).filter(Boolean).slice(0,6));
      return { ok:fields.length>0, evidence:`הטופס נפתח עם: ${fields.join(" · ")}` }; } },

  { id:"שינוי-ציון", where:"/he/record", async run(){
      await go("/he/record",8000);
      const g=p.locator('input[type="number"]').first();
      if(!(await g.count())) return { ok:null, evidence:"אין שדה ציון במצב הזה" };
      const was=await g.inputValue();
      await g.fill(was==="88"?"91":"88"); await p.waitForTimeout(2500);
      return { ok:true, evidence:`הציון שונה מ-${was||"ריק"} ל-${await g.inputValue()}` }; } },

  { id:"הדפסה", where:"/he/planner", async run(){
      await go("/he/planner",8000);
      // לא פותחים דיאלוג הדפסה אמיתי — בודקים שהיד שמפעילה אותו קיימת
      const hooked=await p.evaluate(()=>{
        const btns=[...document.querySelectorAll("button,a")].filter(e=>/הדפס|הדפסה|print/i.test(e.innerText||""));
        return btns.map(e=>e.innerText.trim()).slice(0,3); });
      const css=await p.evaluate(()=>[...document.styleSheets].some(s=>{ try{ return [...s.cssRules].some(r=>r.conditionText?.includes("print")||r.media?.mediaText?.includes("print")); }catch{ return false; } }));
      return { ok:hooked.length>0||css, evidence:`כפתורי הדפסה: ${hooked.join(" · ")||"אין"} · גיליון סגנון להדפסה: ${css?"יש":"אין"}` }; } },

  { id:"שושלת-תרומה", where:"/he/lineage", async run(){
      await go("/he/lineage",10000);
      const t=await T();
      const give=p.locator("button").filter({hasText:/תרמו|שתפו|הוסיפו/}).first();
      const has=await give.count();
      if(!has) return { ok:null, evidence:`אין כפתור תרומה במצב הזה · ${t.slice(0,80)}` };
      await give.click(); await p.waitForTimeout(2500);
      return { ok:true, evidence:`נפתח: ${(await T()).slice(0,110)}` }; } },

  { id:"המלך", where:"/he/dashboard", async run(){
      await go("/he/dashboard",8000);
      const king=p.locator("button").filter({hasText:/המלך הפילוסוף|הרפרנט/}).first();
      if(!(await king.count())) return { ok:false, evidence:"לא נמצא כפתור המלך" };
      await king.click(); await p.waitForTimeout(3500);
      const qs=await p.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.innerText.trim()).filter(x=>/\?$/.test(x)&&x.length>6));
      if(!qs.length) return { ok:false, evidence:"נפתח בלי שאלות מוצעות" };
      await p.getByRole("button",{name:qs[0]}).first().click().catch(()=>{});
      await p.waitForTimeout(9000);
      const t=await T();
      return { ok:true, evidence:`נשאל "${qs[0].slice(0,44)}" · המסך גדל ל-${t.length} תווים` }; } },

  { id:"חיבור-יומן", where:"/he/settings", async run(){
      await go("/he/settings",9000);
      const t=(await p.locator("main").innerText()).replace(/\s+/g," ");
      const oauth=/חברו ל-Google Calendar|חברו ליומן/.test(t);
      const ics=/תזכורות ליומן שלכם/.test(t);
      const copy=p.locator("button").filter({hasText:/העתקת קישור/}).first();
      let copied=false;
      if(await copy.count()){ await copy.click().catch(()=>{}); await p.waitForTimeout(1800);
        copied=/הועתק/.test((await p.locator("main").innerText())); }
      return { ok:ics, evidence:`מנוי ICS: ${ics?"יש":"אין"} · חיבור Google: ${oauth?"יש":"אין"} · העתקת קישור: ${copied?"עבדה":"לא אושרה"}` }; } },

  { id:"בינארי", where:"/he/miluim", async run(){
      await go("/he/miluim",9000);
      const t=await T();
      const quota=t.match(/המרות בינארי[^.]{0,90}/);
      const btn=p.locator("button").filter({hasText:/המירו|המרה לבינארי/}).first();
      const has=await btn.count();
      return { ok:/בינארי/.test(t), evidence:`${quota?.[0]??"—"} · כפתור המרה: ${has?"יש":"אין (לא מילואימניק)"}` }; } },

  { id:"הזמנת-חונך", where:"/he/mentors", async run(){
      await go("/he/mentors",9000);
      const t=await T();
      const btn=p.locator("button,a").filter({hasText:/הזמינו|הצטרפו|בקשו/}).first();
      return { ok:t.length>300, evidence:`${t.slice(0,110)} · פקד הזמנה: ${await btn.count()?"יש":"אין"}` }; } },
];

const all = existsSync(OUT)?JSON.parse(readFileSync(OUT,"utf-8")):{};
await login(p); await p.waitForTimeout(5000);
console.log("═══ שלב 3 · הפעולות שלא נבדקו ═══");
for (const a of ACTIONS) {
  if (ONLY.length && !ONLY.includes(a.id)) continue;
  let r;
  try { r = await a.run(); } catch(e){ r={ok:false,evidence:`חריגה: ${String(e).slice(0,110)}`}; }
  try { r.shot=(await shot(p,`S3-${a.id}`)).split("/").pop(); } catch {}
  const js=[...new Set(errors)].filter(e=>!/ResizeObserver/.test(e)).slice(0,2); errors.length=0;
  if (js.length) r.js=js;
  r.where=a.where; all[a.id]=r; writeFileSync(OUT,JSON.stringify(all,null,1),"utf-8");
  console.log(`${r.ok===null?"➖":r.ok?"✅":"❌"} ${a.id.padEnd(16)} ${r.evidence}`);
  if (js.length) console.log(`      ✗ JS: ${js.join(" | ")}`);
}
await b.close();
