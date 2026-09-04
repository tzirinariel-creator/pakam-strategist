import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const read = async () => {
  const t=(await p.locator("body").innerText()).replace(/\s+/g," ");
  return { a:+(t.match(/סמסטר א׳ (\d+) ש״ס/)||[0,0])[1], bb:+(t.match(/סמסטר ב׳ (\d+) ש״ס/)||[0,0])[1] };
};
try {
  await login(p); await p.waitForTimeout(5000);
  await p.goto(`${BASE}/he/planner`,{waitUntil:"domcontentloaded"});
  await p.waitForFunction(()=>document.body.innerText.length>900, null, {timeout:40000}).catch(()=>{});
  await p.waitForTimeout(7000);
  const before = await read();
  console.log(`לפני:  סמסטר א׳ ${before.a} ש״ס · סמסטר ב׳ ${before.bb} ש״ס`);

  // גרירה ברצף עכבר, מעל סף ההפעלה של dnd-kit (distance: 8)
  // המקור נבחר **מתוך עמודת סמסטר א׳**. `.first()` גלובלי תפס קודם כרטיס
  // שכבר יושב בסמסטר ב׳, וגרירתו לשם אינה שינוי — ואז "לא זז" נראה כמו באג.
  const s = await p.evaluate(() => {
    const head = [...document.querySelectorAll("*")].find(
      (e) => e.children.length === 0 && /^סמסטר א׳$/.test((e.textContent || "").trim())
    );
    if (!head) return null;
    let col = head;
    for (let i = 0; i < 4 && col.parentElement; i++) col = col.parentElement;
    const card = col.querySelector('[aria-roledescription="draggable"]');
    if (!card) return null;
    card.scrollIntoView({ block: "center" });
    const r = card.getBoundingClientRect();
    return r.width ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  // היעד נמדד בתוך העמוד: הכותרת "סמסטר ב׳" הנראית, ומשם העמודה שמכילה אותה.
  const d = await p.evaluate(() => {
    const h = [...document.querySelectorAll("*")].find(
      (e) => e.children.length === 0 && /^סמסטר ב׳$/.test((e.textContent || "").trim())
    );
    if (!h) return null;
    let col = h;
    for (let i = 0; i < 4 && col.parentElement; i++) col = col.parentElement;
    const r = col.getBoundingClientRect();
    return r.width ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  if (!s || !d) throw new Error("לא אותרו מקור/יעד");
  await p.mouse.move(s.x+s.width/2, s.y+s.height/2);
  await p.mouse.down();
  await p.mouse.move(s.x+s.width/2+14, s.y+s.height/2, {steps:3});  // חציית סף ההפעלה
  await p.waitForTimeout(350);
  await p.mouse.move(d.x+d.width/2, d.y+60, {steps:22});
  await p.waitForTimeout(700);
  await p.mouse.up();
  await p.waitForTimeout(6000);

  const after = await read();
  console.log(`אחרי: סמסטר א׳ ${after.a} ש״ס · סמסטר ב׳ ${after.bb} ש״ס`);
  const moved = after.a!==before.a || after.bb!==before.bb;
  console.log(moved ? `✅ קורס עבר בין הסמסטרים (${before.a}→${after.a} · ${before.bb}→${after.bb})`
                    : "❌ שום ש״ס לא זז");
  // רענון — לאמת שהשינוי נשמר בשרת ולא רק במסך
  await p.reload({waitUntil:"domcontentloaded"});
  await p.waitForFunction(()=>document.body.innerText.length>900, null, {timeout:40000}).catch(()=>{});
  await p.waitForTimeout(6000);
  const persisted = await read();
  console.log(`אחרי רענון: א׳ ${persisted.a} · ב׳ ${persisted.bb} → ${persisted.a===after.a&&persisted.bb===after.bb ? "✅ נשמר בשרת" : "‼️ לא נשמר"}`);
  await shot(p,"drag-verified");
  console.log("שגיאות JS:", [...new Set(errors)].filter(e=>!/ResizeObserver/.test(e)).slice(0,2).join(" | ")||"אין");
} finally { await b.close(); }
