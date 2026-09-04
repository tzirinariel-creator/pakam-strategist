// ============================================================
// היסטוריית קורסים לפרסונה — דרך מסך התיק האקדמי
// ------------------------------------------------------------
// זריעת שנה ב׳/ג׳ דרך שנת תחילת התואר נותנת את **השנה** אבל לא את
// **ההיסטוריה**, וסטודנט שנה ג׳ בלי קורסים שהושלמו אינו פרסונה אמיתית.
// כאן מוסיפים קורסים דרך "הזינו את הציונים שכבר יש לכם" — מסלול הכתיבה
// שהאפליקציה עצמה מציעה, לא זריקה למסד.
//
//   node video/add-history.mjs --count 14
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const arg=(f,d)=>process.argv.includes(f)?process.argv[process.argv.indexOf(f)+1]:d;
const COUNT=+arg("--count","14");
// קורסי חובה אמיתיים של שנה א׳–ב׳ בפכ״מ, לפי הגיליון של אריאל
const NAMES=["מבוא ללוגיקה","מתמטיקה לפכ","כתיבה ומחקר","פוליטיקה ומשטר",
  "מבוא לפילוסופיה פוליטית","מבוא לפילוסופיה של המוסר","קריאה מודרכת",
  "סטטיסטיקה לפכ","מיקרו כלכלה א","פילוסופיה של מדעי החברה","מבוא לפילוסופיה חדשה",
  "מיקרו כלכלה ב","מאקרו כלכלה","מבוא לאקונומטריקה","פוליטיקה השוואתית","מבוא לתורת ההכרה"];

const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const T=async()=>(await p.locator("body").innerText()).replace(/\s+/g," ");
try {
  await login(p); await p.waitForTimeout(5000);
  await p.goto(`${BASE}/he/record`,{waitUntil:"domcontentloaded"});
  await p.waitForFunction(()=>document.body.innerText.length>600, null, {timeout:45000}).catch(()=>{});
  await p.waitForTimeout(6000);

  // פתיחת טופס ההוספה אם הוא מקופל
  const opener=p.locator("button").filter({hasText:/הוספת קורס|הוסיפו את הקורס|הזינו את הציונים/}).first();
  if (await opener.count()) { await opener.click().catch(()=>{}); await p.waitForTimeout(2500); }

  const box=p.locator('input[placeholder*="חיפוש"], input[placeholder*="חפשו"], input[aria-label*="חיפוש"]').first();
  if (!(await box.count())) throw new Error("לא נמצאה תיבת חיפוש קורסים בתיק");

  let added=0;
  for (const name of NAMES) {
    if (added>=COUNT) break;
    await box.fill(name); await p.waitForTimeout(2200);
    const hit=p.locator("button").filter({hasText:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))}).first();
    if (!(await hit.count())) { console.log(`  ⏭  "${name}" — אין תוצאה`); continue; }
    try { await hit.click({timeout:6000}); added++; await p.waitForTimeout(2600); console.log(`  ✚ ${name}`); }
    catch { console.log(`  ⏭  "${name}" — לא נלחץ`); }
  }
  await p.waitForTimeout(4000);
  await p.reload({waitUntil:"domcontentloaded"});
  await p.waitForFunction(()=>document.body.innerText.length>600, null, {timeout:45000}).catch(()=>{});
  await p.waitForTimeout(6000);
  const t=await T();
  console.log(`\n✅ נוספו ${added} קורסים`);
  console.log("התיק מציג:", (t.match(/\d+ ש״ס[^·]{0,40}/)||[t.slice(0,90)])[0]);
  await shot(p,"add-history");
  console.log("שגיאות:", errors.length?[...new Set(errors)].slice(0,2).join(" | "):"אין");
} finally { await b.close(); }
