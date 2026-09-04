import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle=async(ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle(5000);
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await settle();
const info = await p.evaluate(() => ({
  selects: [...document.querySelectorAll("select")].map(s => ({
    label: s.closest("label")?.innerText?.replace(/\s+/g," ").trim().slice(0,30) ?? s.getAttribute("aria-label") ?? "",
    options: [...s.options].map(o=>o.text.trim()), value: s.value })),
  rows: [...document.querySelectorAll("tbody tr")].map(r=>r.innerText.replace(/\s+/g," ").trim().slice(0,80)),
  removeBtns: [...document.querySelectorAll("button")].map(e=>(e.innerText||e.getAttribute("aria-label")||"").trim()).filter(x=>/הסר|מחק|הסירו/.test(x)),
}));
console.log(JSON.stringify(info,null,1));
await b.close();
