// מסלול החילוץ: מה קורה לסטודנט אם ה-AI לגמרי לא זמין ביום ההשקה.
// בוחר במפורש "הגיליון לא זמין עכשיו — נמלא ידנית" ומשלים את האשף.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { writeFileSync } from "node:fs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const M = async () => (await p.locator("main").innerText().catch(()=>p.locator("body").innerText())).replace(/\s+/g," ");
const log=[];
const rec = async (n,note)=>{ const f=(await shot(p,`MP-${n}`)).split("/").pop();
  log.push({n,note:String(note).slice(0,220),shot:f});
  writeFileSync("docs/מסלול-ידני.json",JSON.stringify(log,null,1),"utf-8");
  console.log(`📸 ${n.padEnd(22)} ${String(note).slice(0,102)}`); };
const tap = async (re,ms=4500)=>{ const e=p.getByRole("button",{name:re}).first();
  if(!(await e.count()))return false; try{await e.click({timeout:9000});}catch{return false;}
  await p.waitForTimeout(ms); return true; };
try {
  await login(p); await p.waitForTimeout(4000);
  await tap(/^בואו נתחיל$/,5000);
  await p.waitForFunction(()=>/איפה אתם בתואר/.test(document.body.innerText),null,{timeout:45000}).catch(()=>{});
  await rec("01-נקודת-פתיחה","בוחר במסלול הידני");

  // האופציה השלישית — קישור/כפתור "נמלא ידנית"
  const manual = p.locator("button, a").filter({ hasText: /נמלא ידנית|הגיליון לא זמין/ }).first();
  if (!(await manual.count())) { await rec("02-אין-מסלול-ידני","‼️ לא נמצאה אופציה ידנית"); throw new Error("אין מסלול ידני"); }
  await manual.click(); await p.waitForTimeout(5500);
  await rec("02-אחרי-בחירה-ידנית",(await M()).slice(0,170));

  // סימון קורסים ידני
  const boxes = p.locator('[role="checkbox"]');
  const n = await boxes.count();
  console.log(`   תיבות סימון זמינות: ${n}`);
  let marked=0;
  for (let i=0;i<n && marked<8;i++){
    const e=boxes.nth(i);
    if ((await e.getAttribute("aria-checked"))==="true") continue;
    try{ await e.scrollIntoViewIfNeeded(); await e.click({timeout:4000}); marked++; await p.waitForTimeout(260);}catch{}
  }
  await rec("03-סומנו-ידנית",`סומנו ${marked} קורסים בלי שום קריאה ל-AI`);

  for (let turn=0; turn<10; turn++){
    const t=await M();
    if (/סיום ושמירה/.test(t)) {
      await tap(/^סיום ושמירה$/,3000);
      await p.waitForFunction(()=>/הכול מוכן/.test(document.body.innerText),null,{timeout:160000}).catch(()=>{});
      await p.waitForTimeout(4000);
      await rec("04-הכול-מוכן",(await M()).match(/הכול מוכן[^.]{0,80}/)?.[0] ?? "—");
      await tap(/לדף הבית/,9000);
      await rec("05-דף-הבית",(await M()).slice(0,190));
      break;
    }
    if (!(await tap(/^הבא$/,5000)) && !(await tap(/^המשיכו$/,5000))) { console.log("   ⏹ אין המשך"); break; }
  }
  console.log("\nשגיאות JS:", [...new Set(errors)].filter(e=>!/ResizeObserver/.test(e)).slice(0,2).join(" | ")||"אין");
} finally { await b.close(); }
