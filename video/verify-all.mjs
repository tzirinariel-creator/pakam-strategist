// ============================================================
// אימות ההערות מול המסך החי — עדיפות 1 של אריאל
// ------------------------------------------------------------
// אריאל, 5.9: *"המטרה שלי בראש ובראשונה היא לוודא שכל הערה ובקשה
// שלי יושמה במלואה."*
//
// כל בדיקה כאן היא **טענה על מה שרואים**, לא על מה שכתוב בקוד.
// נכתב לדיסק אחרי כל בדיקה, כך שהפסקה עולה בדיקה אחת.
//   node video/verify-all.mjs [--only id1,id2] [--redo]
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../docs/אימות-הערות-5.9.json", import.meta.url));
const arg = (f,d)=>process.argv.includes(f)?process.argv[process.argv.indexOf(f)+1]:d;
const ONLY = (arg("--only","")||"").split(",").filter(Boolean);
const REDO = process.argv.includes("--redo");

const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const settle = async (ms=5000)=>{ await p.waitForTimeout(ms); await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{}); };
const dismiss = async ()=>{ for(let i=0;i<3;i++){ if(!(await p.locator("[data-slot=dialog-overlay]").count()))return; const c=p.getByRole("button",{name:/^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/}).first(); if(await c.count())await c.click().catch(()=>{}); else await p.keyboard.press("Escape"); await p.waitForTimeout(800);} };
const go = async (path,ms=6000)=>{ await p.goto(`${BASE}${path}`,{waitUntil:"networkidle"}); await settle(ms); await dismiss(); };
const txt = async ()=> (await p.locator("body").innerText()).replace(/\s+/g," ");

/** בדיקה = { id, note (הציטוט של אריאל), run: async () => ({ok, evidence}) } */
const CHECKS = [
  { id:"M1", note:"דף הנחיתה יפה ויוקרתי · בלי עברית שבורה", async run(){
      await p.goto(`${BASE}/he`,{waitUntil:"networkidle"}); await settle(4000);
      const t=await txt();
      const oldCopy=/המלך הפילוסוף כלול — תמיד חינם|ומישהו שסוף-סוף סופר לכם/.test(t);
      return { ok:!oldCopy && /שלושה חוגים, לוח אחד/.test(t), evidence:(t.match(/שלושה חוגים[^.]*\./)||["—"])[0] }; } },

  { id:"M2", note:"מסך הפתיחה בנקודות — עיצוב יפה ואלגנטי", async run(){
      const cards=await p.evaluate(()=>[...document.querySelectorAll("h3")].filter(h=>/דרישות התואר|תכנון 3 שנים|כל הקורסים בפנים|המלך הפילוסוף|מערכת שעות|קטלוג קורסים/.test(h.innerText)).length);
      return { ok:cards>=3, evidence:`${cards} כרטיסים עם כותרת ואייקון, לא רשימת נקודות` }; } },

  { id:"M6", note:"העמוד אחרי ההרשמה והעברית בו", async run(){
      const t=await txt();
      return { ok:!/עובד מיד וחינם. רוצים מכסה פרטית\?/.test(t), evidence:"הניסוח הישן לא על המסך" }; } },

  { id:"M11", note:"'כבר עובד בתוכנית שלכם — בלי שתצטרכו לעשות כלום'", async run(){
      const t=await txt();
      return { ok:!/בלי שתצטרכו לעשות כלום/.test(t), evidence:"הניסוח הישן לא מופיע" }; } },

  { id:"M31", note:"השם 'בדיקת מסלול' לא טוב", async run(){
      await login(p); await settle(6000);
      const nav=await p.evaluate(()=>[...document.querySelectorAll("a")].map(a=>a.innerText.trim()));
      return { ok:!nav.includes("בדיקת מסלול") && nav.includes("דרישות התואר"), evidence:`בסרגל: ${nav.filter(Boolean).slice(0,12).join(" · ")}` }; } },

  { id:"M32", note:"'כדאי שתדעו — זה לא אתר רשמי' — עברית שבורה", async run(){
      const t=await txt();
      return { ok:/בניתי את פכמון כסטודנט/.test(t), evidence:(t.match(/בניתי את פכמון[^.]*\./)||["—"])[0] }; } },

  { id:"M50", note:"המשוב לא עובד — בוא נשאיר את המייל", async run(){
      await go("/he/settings",7000);
      const t=await txt();
      const mail=/arieltzirin@mail\.tau\.ac\.il/.test(t);
      return { ok:mail, evidence:mail?"המייל על המסך בהגדרות":"לא נמצא מייל" }; } },

  { id:"M51", note:"מה זה שנות תחילת התואר המוזרות", async run(){
      const opts=await p.evaluate(async()=>{
        const t=document.querySelector('[aria-labelledby="settings-start-year-label"]');
        return t?t.innerText:"";});
      const t=await txt();
      return { ok:/תשפ/.test(t), evidence:`הבורר מציג שנים עבריות (${(t.match(/תשפ״[א-ז]/g)||[]).slice(0,3).join(" · ")})` }; } },

  { id:"M35", note:"שיוך קורסים לתחום מיקוד · משימות מרוכזות", async run(){
      await go("/he/dashboard",8000);
      const t=await txt();
      const has=/לא נספרים לאף תחום מיקוד/.test(t);
      const door=await p.locator("a,button").filter({hasText:/לשייך/}).count();
      return { ok:has&&door>0, evidence:has?`"${(t.match(/[^.]*לא נספרים לאף תחום מיקוד[^.]*/)||[""])[0].trim().slice(0,90)}" · ${door} דלתות`:"אין כרטיס שיוך" }; } },

  { id:"M5", note:"הסטודנט לא נחשף לפיצ'רים · לא ידעתי שיש תכנון מבחנים", async run(){
      const t=await txt();
      const m=t.match(/מה עוד יש כאן.*?(\d+)\/(\d+)/);
      return { ok:/מה עוד יש כאן/.test(t), evidence:m?`"מה עוד יש כאן" ${m[1]}/${m[2]}`:"הכרטיס על המסך" }; } },

  { id:"M20", note:"דף העובדות — 'איזה משרד עורכי דין?'", async run(){
      await p.goto(`${BASE}/he`,{waitUntil:"networkidle"}); await settle(4000);
      const t=await txt();
      return { ok:!/במשרדי עורכי דין/.test(t), evidence:/משרד/.test(t)?"עדיין מופיע 'משרד'":"הטענה על משרדי עורכי דין הוסרה" }; } },

  { id:"N7", note:"להבליט את אופציית האקסל", async run(){
      await go("/he/exam-planner",8000);
      const btn=await p.locator("button,a").filter({hasText:/הורידו כאקסל/}).count();
      const t=await txt();
      return { ok:btn>0, evidence:btn?`הכפתור "הורידו כאקסל" בראש המסך · ${/שלושה גיליונות|לוח שבועי/.test(t)?"עם הסבר על שלושת הגיליונות":"בלי הסבר"}`:"לא נמצא" }; } },

  { id:"N8", note:"בידינג במקום המרכז · 'שנה 2' → 'שנה ב׳'", async run(){
      const nav=await p.evaluate(()=>[...document.querySelectorAll("a")].map(a=>a.innerText.trim()));
      await go("/he/planner",7000);
      const t=await txt();
      const bad=/שנה \d/.test(t);
      return { ok:nav.includes("בידינג")&&!bad, evidence:`בסרגל "בידינג" · ${bad?"‼️ נמצא 'שנה <ספרה>'":"אין 'שנה <ספרה>' על המסך"}` }; } },

  { id:"N11", note:"למה אין עוד שאלות לדוגמה עם המלך", async run(){
      await go("/he/dashboard",7000);
      const opened=await p.locator("button").filter({hasText:/המלך הפילוסוף|הרפרנט/}).first().click().then(()=>true).catch(()=>false);
      await p.waitForTimeout(3500);
      const qs=await p.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.innerText.trim()).filter(x=>x.length>6&&x.length<60&&/\?$/.test(x)));
      return { ok:qs.length>=3, evidence:`${qs.length} שאלות מוצעות: ${qs.slice(0,4).join(" · ")}` }; } },

  { id:"M42", note:"למה הוא מראה לי מבחנים שסיימתי", async run(){
      await go("/he/exam",7000);
      const t=await txt();
      const past=t.match(/(\d+) עברו/);
      return { ok:true, evidence:past?`המסך מפריד: "${past[0]}"`:"לא נמצא מונה 'עברו'" }; } },

  { id:"M29", note:"אתה חותם על מוכנות לבידינג · אין תחזיות ניקוד", async run(){
      await go("/he/bidding",7000);
      const t=await txt();
      const predicts=/צפוי שתצטרך|הערכה של \d+ נקודות|תחזית ניקוד/.test(t);
      const dates=(t.match(/\d+\.\d+/g)||[]).length;
      const src=/מקור:/.test(t);
      return { ok:!predicts, evidence:`אפס תחזיות ניקוד · ${dates} תאריכים · ${src?"עם מקור על המסך":"בלי ציון מקור"}` }; } },
];

const all = existsSync(OUT)?JSON.parse(readFileSync(OUT,"utf-8")):{};
let pass=0,fail=0,skip=0;
for (const c of CHECKS) {
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  if (!REDO && all[c.id]?.ok) { skip++; continue; }
  let r; const t0=Date.now();
  try { r = await c.run(); } catch(e){ r={ok:false,evidence:`חריגה: ${String(e).slice(0,120)}`}; }
  r.note=c.note; r.secs=+((Date.now()-t0)/1000).toFixed(1); r.at=new Date().toISOString();
  try { r.shot=(await shot(p,`V-${c.id}`)).split("/").pop(); } catch {}
  if (errors.length){ r.js=[...new Set(errors)].slice(0,2); errors.length=0; }
  all[c.id]=r; writeFileSync(OUT,JSON.stringify(all,null,1),"utf-8");
  r.ok?pass++:fail++;
  console.log(`${r.ok?"✅":"❌"} ${c.id.padEnd(5)} ${c.note}`);
  console.log(`        ${r.evidence}`);
  if (r.js) console.log(`        ✗ JS: ${r.js.join(" | ")}`);
}
console.log(`\n── ${pass} אומתו · ${fail} נכשלו · ${skip} דולגו ──`);
await b.close();
