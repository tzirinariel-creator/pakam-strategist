// מדידת HIG על ארבעת המסכים — לפי הכללים בסקיל, לא לפי העין
import { openApp, login, BASE } from "./tour-lib.mjs";
const MOBILE = process.argv.includes("--mobile");
const { b, p } = await openApp(MOBILE ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 1000 });
const settle = async (ms=6000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"), null,{timeout:45000}).catch(()=>{});};
const dismiss = async () => { for(let i=0;i<3;i++){ if(!(await p.locator("[data-slot=dialog-overlay]").count()))return; const c=p.getByRole("button",{name:/^(הבנתי, בואו נתכנן|הבנתי|סגור|Close)$/}).first(); if(await c.count())await c.click().catch(()=>{}); else await p.keyboard.press("Escape"); await p.waitForTimeout(800);} };

const audit = () => p.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaf = [...document.querySelectorAll("p,span,h1,h2,h3,h4,li,td,label,button,a")].filter((e) => e.children.length === 0 && (e.innerText||"").trim() && vis(e));
  // סולם הטיפוגרפיה — HIG: "Minimize the number of typefaces / maintain hierarchy"
  const sizes = {}, weights = {}, fams = new Set();
  for (const e of leaf) {
    const cs = getComputedStyle(e);
    const px = Math.round(parseFloat(cs.fontSize));
    sizes[px] = (sizes[px]||0)+1;
    weights[cs.fontWeight] = (weights[cs.fontWeight]||0)+1;
    fams.add(cs.fontFamily.split(",")[0].replace(/['"]/g,"").trim());
  }
  // פסקאות ארוכות — HIG Layout: אל תצפיף מידע לא-חיוני מעל החשוב
  const walls = leaf.filter((e)=> (e.innerText||"").trim().length > 180)
    .map((e)=>({ len:(e.innerText||"").trim().length, px:Math.round(parseFloat(getComputedStyle(e).fontSize)), t:(e.innerText||"").trim().slice(0,70) }));
  // יעדי מגע — HIG: ≥44pt נייד, ≥24pt דסקטופ
  const floor = window.innerWidth < 768 ? 44 : 24;
  const small = [...document.querySelectorAll("button,a,[role=button],input,select")].filter(vis).map((e)=>{
    const r = e.getBoundingClientRect();
    return { w:Math.round(r.width), h:Math.round(r.height), t:((e.innerText||e.getAttribute("aria-label")||"").trim().slice(0,32)) };
  }).filter((x)=> (x.h < floor || x.w < floor) && x.t);
  // טקסט שנשען על צבע בלבד — HIG Accessibility
  const colorOnly = leaf.filter((e)=>{
    const cs=getComputedStyle(e); const t=(e.innerText||"").trim();
    return /^[+\-]?\d+(\.\d+)?%?$/.test(t) && cs.color !== getComputedStyle(document.body).color;
  }).length;
  return { sizes, weights, fams:[...fams], walls: walls.slice(0,6), small: small.slice(0,14), smallCount: small.length, floor, colorOnly, leafCount: leaf.length };
});

await login(p); await settle();
for (const [path, name, extra] of [
  ["/he/graduation", "מחשבון ציון גמר + סימולציה", "sim"],
  ["/he/exam-planner", "מתכנן המבחנים", null],
]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); await settle(7000); await dismiss();
  if (extra === "sim") {
    const s = p.getByRole("button", { name: /מה יקרה לממוצע אם/ }).first();
    if (await s.count()) { await s.click(); await settle(3000);
      const e = p.getByRole("button", { name: /^בואו נראה$/ }).first();
      if (await e.count()) { await e.click(); await settle(4000); } }
  }
  const a = await audit();
  console.log(`\n════ ${name} · ${MOBILE?"נייד":"דסקטופ"} ════`);
  console.log(`  גדלי טקסט (${Object.keys(a.sizes).length} שונים):`, Object.entries(a.sizes).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${k}px×${v}`).join(" · "));
  console.log(`  משקלים:`, Object.entries(a.weights).map(([k,v])=>`${k}×${v}`).join(" · "));
  console.log(`  גופנים:`, a.fams.join(" · "));
  console.log(`  יעדי מגע מתחת ל-${a.floor}px: ${a.smallCount}`);
  for (const s of a.small) console.log(`      ${s.w}×${s.h}  «${s.t}»`);
  console.log(`  פסקאות מעל 180 תווים: ${a.walls.length}`);
  for (const w of a.walls) console.log(`      ${w.len} תווים ב-${w.px}px — «${w.t}…»`);
}
await b.close();
