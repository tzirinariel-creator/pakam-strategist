// U4 — גיל: "בתחושה שלה זה יחסית עמוס, בכותרות".
// "עמוס" היא תחושה; המספרים שמאחוריה הם אורך התת־כותרת ומספר הפקדים
// שיושבים בשורת הכותרת. מודד את שניהם בכל מסך, בשני רוחבים.
import { openApp, login, BASE } from "./tour-lib.mjs";
const W = +(process.argv.includes("--width") ? process.argv[process.argv.indexOf("--width")+1] : 1440);
const ROUTES = [["/he/dashboard","בית"],["/he/planner","תכנון"],["/he/bidding","בידינג"],
  ["/he/regulations","דרישות"],["/he/record","תיק"],["/he/graduation","ציון גמר"],
  ["/he/miluim","מילואים"],["/he/exam","בחינות"],["/he/exam-planner","תכנון מבחנים"],
  ["/he/calendar","יומן"],["/he/catalog","קטלוג"],["/he/lineage","שושלת"],["/he/settings","הגדרות"]];
const { b, p } = await openApp({ width: W, height: W < 700 ? 844 : 1100 });
try {
  await login(p); await p.waitForTimeout(5000);
  console.log(`רוחב ${W}px · כותרת | תת־כותרת (תווים) | פקדים בשורה | שורות שהכותרת תופסת`);
  for (const [u,label] of ROUTES) {
    await p.goto(`${BASE}${u}`,{waitUntil:"domcontentloaded"});
    await p.waitForFunction(()=>document.body.innerText.length>500, null,{timeout:30000}).catch(()=>{});
    await p.waitForTimeout(4000);
    const m = await p.evaluate(()=>{
      const h1 = document.querySelector("main h1");
      if (!h1) return null;
      const head = h1.closest("div")?.parentElement?.parentElement;
      const sub = h1.parentElement?.querySelector("p");
      const acts = head ? head.querySelectorAll("button, a").length : 0;
      const r = head?.getBoundingClientRect();
      return { title:(h1.innerText||"").trim(), sub:(sub?.innerText||"").trim(), acts,
               h: r? Math.round(r.height):0 };
    });
    if (!m) { console.log(`  ${label.padEnd(14)} — אין h1 ב-main`); continue; }
    const flag = m.sub.length > 60 || m.acts > 3 ? "⚠️ " : "  ";
    console.log(`${flag}${label.padEnd(14)} ${String(m.sub.length).padStart(3)} תווים · ${m.acts} פקדים · ${m.h}px`);
    if (m.sub.length > 60) console.log(`      "${m.sub.slice(0,90)}"`);
  }
} finally { await b.close(); }
