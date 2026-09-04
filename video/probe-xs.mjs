import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp();
await login(p);
await p.goto(`${BASE}/he/settings`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const probe=document.createElement("div"); probe.className="text-xs"; probe.textContent="x";
  document.body.appendChild(probe);
  const xs=getComputedStyle(probe).fontSize; probe.remove();
  const li=[...document.querySelectorAll("li")].find(e=>/כששואלים את העוזר/.test(e.textContent||""));
  return { textXsResolves: xs, thatLi: li?getComputedStyle(li).fontSize:"—", root: getComputedStyle(document.documentElement).fontSize };
})));
await b.close();
