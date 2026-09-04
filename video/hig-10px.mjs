import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1000 });
const settle=async(ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle();
await p.goto(`${BASE}/he/exam-planner`,{waitUntil:"networkidle"}); await settle();
for(let i=0;i<3;i++){ if(!(await p.locator("[data-slot=dialog-overlay]").count()))break; const c=p.getByRole("button",{name:/^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/}).first(); if(await c.count())await c.click().catch(()=>{}); else await p.keyboard.press("Escape"); await p.waitForTimeout(800);}
const r = await p.evaluate(() => {
  const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const leaf=[...document.querySelectorAll("p,span,h1,h2,h3,h4,li,td,label,button,a,div")].filter(e=>e.children.length===0&&(e.innerText||"").trim()&&vis(e));
  const ten=leaf.filter(e=>Math.round(parseFloat(getComputedStyle(e).fontSize))===10);
  const byText={}; const byParent={};
  for(const e of ten){
    const t=(e.innerText||"").trim();
    const kind = /^\d+(\.\d+)?$/.test(t) ? "מספר בלבד"
      : /^\+ ?לימוד$/.test(t) ? "«+ לימוד»"
      : t.length<=4 ? "תווית קצרה (≤4 תווים)"
      : t.length<=14 ? "תווית (≤14)" : "משפט (>14 תווים)";
    byText[kind]=(byText[kind]||0)+1;
    const pc=(e.parentElement?.className||"").toString().slice(0,45);
    byParent[pc]=(byParent[pc]||0)+1;
  }
  const sentences=ten.filter(e=>(e.innerText||"").trim().length>14).map(e=>(e.innerText||"").trim().slice(0,55));
  return { total: ten.length, byText, top: Object.entries(byParent).sort((a,b)=>b[1]-a[1]).slice(0,5), sentences:[...new Set(sentences)].slice(0,10) };
});
console.log("אלמנטים ב-10px:", r.total);
console.log("\nלפי סוג:"); for(const [k,v] of Object.entries(r.byText)) console.log(`  ${v.toString().padStart(4)}  ${k}`);
console.log("\nההורים הנפוצים:"); for(const [k,v] of r.top) console.log(`  ${v.toString().padStart(4)}  ${k}`);
console.log("\nמשפטים ב-10px (מעל 14 תווים) — אלה שחורגים מכלל התוויות:");
r.sentences.forEach(s=>console.log(`  «${s}»`));
await b.close();
