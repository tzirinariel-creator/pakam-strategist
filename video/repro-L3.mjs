import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp();
const click=async(re,lbl)=>{const e=p.getByRole("button",{name:re}).first();
  if(!(await e.count())){console.log("   ✗ אין:",lbl??re);return false}
  await e.click().catch(()=>{}); await p.waitForTimeout(3200); return true};
await login(p); await p.waitForTimeout(4000);
// אשף מהיר כשנה א׳
await click(/^פכ״מ/); await click(/בואו נתחיל/); await click(/מתחילים את התואר עכשיו/);
for (const re of [/^שנה א׳$/,/^סמסטר א׳$/,/^לשון זכר$/,/^כלכלה$/]) {
  const e=p.getByRole("button",{name:re}).first(); if(await e.count()){await e.click().catch(()=>{});await p.waitForTimeout(500)} }
await click(/^הבא$/);
await p.getByRole("button",{name:/^סיום ושמירה$/}).first().click();
await p.waitForTimeout(9000);
console.log("האשף הסתיים. עכשיו הולך ללוח, משנה, ושומר — בדיוק כמו אריאל:\n");

await p.goto(`${BASE}/he/planner`,{waitUntil:"networkidle"}); await p.waitForTimeout(6000);
console.log(await shot(p,"L3-a-planner"));
const edit = p.getByRole("link",{name:/תכננו את שני הסמסטרים|לעריכת התכנון/}).first();
const editBtn = p.getByRole("button",{name:/תכננו את שני הסמסטרים|לעריכת התכנון/}).first();
if (await edit.count()) { await edit.click(); }
else if (await editBtn.count()) { await editBtn.click(); }
else console.log("   ✗ לא נמצא כפתור עריכה");
await p.waitForTimeout(7000);
console.log("URL אחרי לחיצה:", p.url().replace(BASE,""));
console.log(await shot(p,"L3-b-after-click"));
const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
const i=t.indexOf("החלטות גדולות."); console.log("מה על המסך:", t.slice(i+16,i+380));

// שומר
const save = p.getByRole("button",{name:/^סיום ושמירה$/}).first();
if (await save.count()) {
  const t0=Date.now();
  await save.click();
  for (let k=0;k<10;k++){
    await p.waitForTimeout(2500);
    const el=Math.round((Date.now()-t0)/1000);
    const tt=(await p.locator("body").innerText()).replace(/\n+/g," | ");
    const bad=/אין קורסים בתוכנית|לא נשמר|לא הצלחנו לשמור/.test(tt);
    console.log(`  ${String(el).padStart(3)}s · ${p.url().replace(BASE,"")} ${bad?"  ‼‼ הודעת 'לא נשמר' על המסך":""}`);
    if(bad){ console.log(await shot(p,`L3-c-NOT-SAVED-${el}s`)); }
    if(/הכול מוכן|המצב שלי|מהתואר הושלמו/.test(tt) && !bad) break;
  }
  console.log(await shot(p,"L3-d-final"));
} else console.log("   ✗ אין כפתור שמירה כאן");
console.log("\nשגיאות:", errors.length?[...new Set(errors)].join(" | "):"אין");
await b.close();
