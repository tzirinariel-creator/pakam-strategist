import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle=async(ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle(5000);
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"}); await settle();
const t=(await p.locator("body").innerText()).replace(/\s+/g," ");
console.log("מסך:", t.slice(0,700));
const els = await p.evaluate(()=>({
  buttons: [...document.querySelectorAll("button")].filter(e=>e.getBoundingClientRect().height>0).map(e=>(e.innerText||e.getAttribute("aria-label")||"").replace(/\s+/g," ").trim()).filter(Boolean),
  inputs: [...document.querySelectorAll("input,select")].map(e=>`${e.tagName}:${e.type||""}:${e.getAttribute("aria-label")||e.id||e.name||""}`),
}));
console.log("\nכפתורים:", JSON.stringify([...new Set(els.buttons)],null,0));
console.log("שדות:", JSON.stringify(els.inputs,null,0));
console.log(await shot(p,"miluim-probe",{full:true}));
await b.close();
