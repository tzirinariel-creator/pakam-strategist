import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp();
await login(p);
await p.goto(`${BASE}/he/settings`,{waitUntil:"networkidle"}); await p.waitForTimeout(5000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const li=[...document.querySelectorAll("li")].find(e=>/כששואלים את העוזר/.test(e.textContent||""));
  if(!li) return "לא נמצא";
  const chain=[]; let n=li;
  for(let i=0;i<5&&n;i++){ chain.push({tag:n.tagName, cls:(n.className||"").toString().slice(0,90), fs:getComputedStyle(n).fontSize}); n=n.parentElement; }
  return chain;
}), null, 1));
await b.close();
