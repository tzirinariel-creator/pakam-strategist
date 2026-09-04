import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp();
const click=async(re)=>{const e=p.getByRole("button",{name:re}).first(); if(await e.count()){await e.click().catch(()=>{});await p.waitForTimeout(3200);return true} console.log("   ✗ אין:",re); return false};
await login(p); await p.waitForTimeout(5000);
await click(/^פכ״מ/); await click(/בואו נתחיל/); await click(/מתחילים את התואר עכשיו/);
for (const re of [/^שנה א׳$/,/^סמסטר א׳$/,/^לשון זכר$/,/^כלכלה$/]) { const e=p.getByRole("button",{name:re}).first(); if(await e.count()){await e.click().catch(()=>{});await p.waitForTimeout(600)} }
await click(/^הבא$/);
console.log("במסך המערכת. לוחץ 'סיום ושמירה' ומודד מה קורה אחריו:");
const t0=Date.now();
await p.getByRole("button",{name:/^סיום ושמירה$/}).first().click();
for (let i=0;i<16;i++){
  await p.waitForTimeout(5000);
  const el=Math.round((Date.now()-t0)/1000);
  const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
  const head=t.slice(t.indexOf("החלטות גדולות.")+16, t.indexOf("החלטות גדולות.")+190);
  const url=p.url().replace(BASE,"");
  console.log(`  ${String(el).padStart(3)}s · ${url} · ${head.trim().slice(0,120)}`);
  if (/הכול מוכן|כל התואר במקום אחד|מה עוד יש כאן|המצב שלי/.test(t) && !/רושמים את הקורסים/.test(t)) { console.log("  ← הגיע ליעד"); break; }
}
console.log(await shot(p,"finish-end"));
console.log("שגיאות:", errors.length?[...new Set(errors)].join(" | "):"אין");
await b.close();
