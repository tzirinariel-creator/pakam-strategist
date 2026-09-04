import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp();
await login(p); await p.waitForTimeout(4000);
for (const pass of [1,2]) {
  await p.goto(`${BASE}/he/planner/semester`,{waitUntil:"networkidle"}); await p.waitForTimeout(7000);
  const modal = await p.evaluate(()=>{
    const d=document.querySelector('[role=dialog]');
    return d ? (d.innerText||"").replace(/\n+/g," | ").slice(0,90) : null;
  });
  console.log(`כניסה ${pass}: ${modal ? "⚠️ חלון פתוח → "+modal : "✓ בלי חלון חוסם"}`);
  console.log("  ", await shot(p,`L2b-entry-${pass}`));
  if (modal) { const g=p.getByRole("button",{name:/הבנתי, בואו נתכנן/}).first(); if(await g.count()){await g.click();await p.waitForTimeout(1500);} }
  const t=(await p.locator("body").innerText()).replace(/\n+/g," | ");
  const i=t.indexOf("החלטות גדולות.");
  if(pass===2) console.log("   על המסך:", t.slice(i+16,i+260));
  const reopen = await p.getByRole("button",{name:/מה שצריך לדעת על פכ״מ/}).count();
  console.log("   כפתור לפתוח שוב:", reopen ? "✓ קיים" : "✗ חסר");
}
console.log("שגיאות:", errors.length?[...new Set(errors)].join(" | "):"אין");
await b.close();
