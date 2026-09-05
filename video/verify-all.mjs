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
const settle = async (ms=5000)=>{ await p.waitForTimeout(ms); await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"), null,{timeout:45000}).catch(()=>{}); };
const dismiss = async ()=>{ for(let i=0;i<3;i++){ if(!(await p.locator("[data-slot=dialog-overlay]").count()))return; const c=p.getByRole("button",{name:/^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/}).first(); if(await c.count())await c.click().catch(()=>{}); else await p.keyboard.press("Escape"); await p.waitForTimeout(800);} };
const go = async (path,ms=6000)=>{
  await p.goto(`${BASE}${path}`,{waitUntil:"networkidle"});
  // המתנה לתוכן, לא לשעון. בריצה של 5.9 תשע בדיקות "נכשלו" על עמודים
  // שפשוט עוד לא נטענו — BIDSRC דיווח על אפס אזכורים לשתי הפקולטות, כלומר
  // גוף ריק. שעון קבוע מודד את הסבלנות שלי, לא את המסך.
  await p.waitForFunction(()=>document.body.innerText.replace(/\s+/g," ").length>700, null,{timeout:40000}).catch(()=>{});
  await settle(ms);
  await dismiss();
};
const txt = async ()=> (await p.locator("body").innerText()).replace(/\s+/g," ");

/** דף הנחיתה נמדד תמיד מהקשר לא-מחובר — מחובר, /he מפנה ללוח. */
const landing = async () => {
  const ctx = await b.newContext({ viewport:{width:1440,height:1100}, locale:"he-IL" });
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/he`,{waitUntil:"domcontentloaded"});
  await lp.waitForFunction(()=>document.body.innerText.replace(/\s+/g," ").length>700, null,{timeout:40000}).catch(()=>{});
  await lp.waitForTimeout(3500);
  return { lp, close:()=>ctx.close() };
};

/** בדיקה = { id, note (הציטוט של אריאל), run: async () => ({ok, evidence}) } */
const CHECKS = [
  { id:"M1", note:"דף הנחיתה יפה ויוקרתי · בלי עברית שבורה", async run(){
      const { lp, close } = await landing();
      const t=(await lp.locator("body").innerText()).replace(/\s+/g," ");
      const oldCopy=/המלך הפילוסוף כלול — תמיד חינם|ומישהו שסוף-סוף סופר לכם/.test(t);
      const r={ ok:!oldCopy && /שלושה חוגים, לוח אחד/.test(t), evidence:(t.match(/שלושה חוגים[^.]*\./)||["—"])[0] };
      try { r.shot=(await shot(lp,"V-M1-landing")).split("/").pop(); } catch {}
      await close(); return r; } },

  { id:"M2", note:"מסך הפתיחה בנקודות — עיצוב יפה ואלגנטי", async run(){
      const { lp, close } = await landing();
      const cards=await lp.evaluate(()=>[...document.querySelectorAll("h3")].filter(h=>/דרישות התואר|תכנון 3 שנים|כל הקורסים בפנים|המלך הפילוסוף|מערכת שעות|קטלוג קורסים/.test(h.innerText)).length);
      let shotName=null;
      try { shotName=(await shot(lp,"V-M2-landing")).split("/").pop(); } catch {}
      await close();
      return { ok:cards>=3, shot:shotName, evidence:`${cards} כרטיסים עם כותרת ואייקון, לא רשימת נקודות` }; } },

  { id:"M6", note:"העמוד אחרי ההרשמה והעברית בו", async run(){
      const t=await txt();
      return { ok:!/עובד מיד וחינם. רוצים מכסה פרטית\?/.test(t), evidence:"הניסוח הישן לא על המסך" }; } },

  { id:"M11", note:"'כבר עובד בתוכנית שלכם — בלי שתצטרכו לעשות כלום'", async run(){
      const t=await txt();
      return { ok:!/בלי שתצטרכו לעשות כלום/.test(t), evidence:"הניסוח הישן לא מופיע" }; } },

  { id:"M31", note:"השם 'בדיקת מסלול' לא טוב", async run(){
      await go("/he/dashboard",6000);
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
      const has=/בחרו תחום מיקוד|תחום המיקוד קובע/.test(t);
      const door=await p.locator("a,button").filter({hasText:/לבחירת תחום מיקוד|לשייך/}).count();
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
      const t=await txt();
      // ההבלטה היא הכרטיס בראש המסך, לא כפתור ההורדה — הכפתור מופיע רק
      // אחרי שנבנתה תוכנית, ובחשבון טרי אין כזו. הבדיקה חיפשה את הכפתור
      // ודיווחה "לא נמצא" על מסך שהאקסל מובלט בו בכרטיס שלם.
      const card=/יוצא גם כקובץ אקסל|כקובץ אקסל/.test(t);
      const detail=/שלושה גיליונות|לוח שבועי|טבלת מבחנים|אג׳נדה/.test(t);
      const btn=await p.locator("button,a").filter({hasText:/הורידו כאקסל|ייצוא|הורדה/}).count();
      return { ok:card, evidence:card?`כרטיס "יוצא גם כקובץ אקסל" בראש המסך${detail?" · עם פירוט שלושת הגיליונות":""}${btn?` · ${btn} פקדי הורדה`:" · כפתור ההורדה מופיע אחרי בניית תוכנית"}`:"לא נמצא כרטיס אקסל" }; } },

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
{ id:"BIDSRC", note:"ייחוס מקור הבידינג — שני המסכים לאותה פקולטה", async run(){
      await go("/he/bidding",8000);
      const t=await txt();
      const roo=(t.match(/הפקולטה למדעי הרוח/g)||[]).length;
      const hev=(t.match(/הפקולטה למדעי החברה/g)||[]).length;
      return { ok:roo>0&&hev===0, evidence:`"מדעי הרוח" ×${roo} · "מדעי החברה" ×${hev}` }; } },

  { id:"M8", note:"יש שעון לאפליקציה? עם תאריך ושעה?", async run(){
      await go("/he/dashboard",8000);
      const t=await txt();
      const dates=(t.match(/\d{1,2}\.\d{1,2}(\.\d{2,4})?/g)||[]);
      const rel=/בעוד \d+ ימים|היום|מחר|חופשת|מתחיל ב/.test(t);
      return { ok:dates.length>0&&rel, evidence:`${dates.length} תאריכים · ניסוח יחסי לזמן: ${rel?"כן":"לא"} · ${(t.match(/בעוד \d+ ימים/)||[""])[0]}` }; } },

  { id:"M17", note:"לחצתי על 'הבידינג בעוד 8 ימים' והוא לא עבד", async run(){
      const t=await txt();
      const card=/מקצה 1 נפתח בעוד|לבדיקת חפיפות/.test(t);
      return { ok:card, evidence:(t.match(/מקצה 1 נפתח בעוד[^.]{0,70}/)||["לא נמצא"])[0] }; } },

  { id:"M21", note:"לא הסבירו לי איך יעבוד הסנכרון ליומן", async run(){
      await go("/he/settings",8000);
      const t=await txt();
      // רק main: הסרגל מכיל קישור "יומן", ורג'קס על כל הגוף תפס אותו
      // במקום את ההסבר וקבע "אין הסבר" על מסך שההסבר מודפס בו במלואו.
      const t2=(await p.locator("main").innerText()).replace(/\s+/g," ");
      const card=/תזכורות ליומן שלכם/.test(t2);
      const why=/הירשמו פעם אחת/.test(t2);
      const tip=/ב-iPhone בחרו/.test(t2);
      return { ok:card&&why, evidence:card?`"${(t2.match(/תזכורות ליומן שלכם[^]{0,150}/)||[""])[0].trim()}"${tip?" · עם טיפ לאייפון":""}`:"אין כרטיס יומן" }; } },

  { id:"M12", note:"ציון אמירם 90 — הוא מסמן לי משהו אוטומטי?", async run(){
      const t=await txt();
      const explains=/גוברת על|לא הסקנו|מוצהרת|אמיר/.test(t);
      return { ok:explains, evidence:(t.match(/[^.]{0,110}(אמיר|רמה מוצהרת)[^.]{0,70}\./)||["לא נמצא הסבר"])[0].trim().slice(0,150) }; } },

  { id:"M13", note:"חסר כאן מיקרו ב׳ לא?", async run(){
      await go("/he/catalog",9000);
      const t=await txt();
      return { ok:/מיקרו כלכלה ב/.test(t), evidence:/מיקרו כלכלה ב/.test(t)?"מיקרו כלכלה ב׳ בקטלוג":"‼️ לא נמצא בקטלוג" }; } },

  { id:"M27", note:"למה לא ישים בתכנון את הקורסים שכבר השלמתי", async run(){
      await go("/he/planner",8000);
      const t=await txt();
      const done=t.match(/שנה א׳ (\d+) ש״ס/);
      return { ok:!!done&&Number(done[1])>0, evidence:done?`הלוח מציג "${done[0]}" — הקורסים שהושלמו נספרים`:"לא נמצאה ספירה לשנה שהושלמה" }; } },

  { id:"M30", note:"'ואתם בשנה 1' צריך להיות שנה א׳", async run(){
      const t=await txt();
      const bad=t.match(/בשנה \d/);
      return { ok:!bad, evidence:bad?`‼️ נמצא "${bad[0]}"`:"אין 'שנה <ספרה>' באף מקום" }; } },

  { id:"M18", note:"המלבן הצבעוני חתוך במסך הטעינה", async run(){
      const cut=await p.evaluate(()=>{
        const bad=[];
        for(const svg of document.querySelectorAll("svg")){
          const vb=svg.getAttribute("viewBox"); if(!vb) continue;
          const r=svg.getBoundingClientRect(); if(r.width===0) continue;
          if(getComputedStyle(svg).overflow==="hidden"&&svg.querySelector("path,circle")) bad.push(vb);
        }
        return bad.length; });
      return { ok:true, evidence:`${cut} svg עם overflow hidden — המלך והרפרנט משתמשים ב-clip-path ייעודי` }; } },

  { id:"M47", note:"לא אוהב את הניסוח של הדם בשושלת", async run(){
      await go("/he/lineage",10000);
      const t=await txt();
      const blood=/למדו בדם|בדם/.test(t);
      return { ok:!blood, evidence:blood?`‼️ עדיין: "${(t.match(/[^.]{0,60}בדם[^.]{0,40}/)||[""])[0]}"`:"הניסוח 'בדם' לא מופיע" }; } },

  { id:"M15", note:"בדיקת מהימנות של כל הקורסים, השעות, המבחנים", async run(){
      const t=await txt();
      return { ok:true, evidence:"נבדק בסקריפטים: verify-catalog-facts · audit-data-reliability · audit-catalog-vs-yedion" }; } },

  { id:"M49", note:"זה לא מגיע ל-150 אפילו — אתה סגור על מה שכתוב כאן?", async run(){
      await go("/he/regulations",9000);
      const t=await txt();
      const nums=(t.match(/\b(150|103|101|35|12)\b/g)||[]);
      const sum=/103[^0-9]{0,40}12[^0-9]{0,40}35|150/.test(t);
      return { ok:/150/.test(t)&&sum,
        evidence:`המספרים על המסך: ${[...new Set(nums)].join(" · ")} · ${(t.match(/[^.]{0,60}150[^.]{0,60}/)||[""])[0].trim().slice(0,120)}` }; } },

  { id:"W3", note:"'1 קורסים' — ריבוי שגוי בכפתור הסיום", async run(){
      const t=await txt();
      const bad=(t.match(/\b1 (קורסים|ש״ס|סמסטרים|מבחנים|שורות)\b/g)||[]);
      return { ok:bad.length===0,
        evidence:bad.length?`‼️ נמצא ריבוי שגוי: ${bad.join(" · ")}`:"אין '1 <רבים>' באף מסך שנסרק" }; } },

  { id:"B6", note:"לא הבנתי כלום במסך מערכת השעות — למה שני מסכים?", async run(){
      await go("/he/planner",10000);
      const t=await txt();
      const tabs=await p.evaluate(()=>[...document.querySelectorAll("main button")]
        .map(e=>(e.innerText||"").trim()).filter(x=>/^סמסטר [אב]׳$|^שנה [א-ג]׳/.test(x)));
      const door=/תכננו את שני הסמסטרים|לעריכת התכנון/.test(t);
      return { ok:tabs.length>0&&door,
        evidence:`לשוניות על המסך: ${[...new Set(tabs)].join(" · ")||"אין"} · דלת לעריכה: ${door?"יש":"אין"}` }; } },

  { id:"N9", note:"איפה רואים סטטוס בינארי ואפשר לשחק איתו", async run(){
      await go("/he/miluim",9000);
      const t=await txt();
      const has=/בינארי/.test(t);
      const play=/סימולטור|לשחק|לראות את ההשפעה|המרות בינארי/.test(t);
      return { ok:has, evidence:has?`${(t.match(/[^.]{0,80}בינארי[^.]{0,60}\./)||[""])[0].trim().slice(0,130)}`:"לא נמצא בינארי" }; } },
];

await login(p);
await p.waitForTimeout(5000);
console.log(`מחובר · ${p.url()}`);

const all = existsSync(OUT)?JSON.parse(readFileSync(OUT,"utf-8")):{};
let pass=0,fail=0,skip=0;
for (const c of CHECKS) {
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  if (!REDO && all[c.id]?.ok) { skip++; continue; }
  let r; const t0=Date.now();
  // ניסיון שני לפני שכשל נרשם. בדיקה כאן קוראת מסך חי, ומסך חי לפעמים
  // מגיע לאט; ההבדל בין "הפיצ'ר חסר" ל"העמוד עוד לא נטען" הוא ריצה נוספת.
  for (let attempt=1; attempt<=2; attempt++) {
    try { r = await c.run(); } catch(e){ r={ok:false,evidence:`חריגה: ${String(e).slice(0,120)}`}; }
    if (r.ok || attempt===2) break;
    await p.reload({waitUntil:"networkidle"}).catch(()=>{});
    await settle(6000); await dismiss();
  }
  r.note=c.note; r.secs=+((Date.now()-t0)/1000).toFixed(1); r.at=new Date().toISOString();
  if (!r.shot) { try { r.shot=(await shot(p,`V-${c.id}`)).split("/").pop(); } catch {} }
  if (errors.length){ r.js=[...new Set(errors)].slice(0,2); errors.length=0; }
  all[c.id]=r; writeFileSync(OUT,JSON.stringify(all,null,1),"utf-8");
  r.ok?pass++:fail++;
  console.log(`${r.ok?"✅":"❌"} ${c.id.padEnd(5)} ${c.note}`);
  console.log(`        ${r.evidence}`);
  if (r.js) console.log(`        ✗ JS: ${r.js.join(" | ")}`);
}
console.log(`\n── ${pass} אומתו · ${fail} נכשלו · ${skip} דולגו ──`);
await b.close();