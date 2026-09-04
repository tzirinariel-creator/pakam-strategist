import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle = async (ms=7000)=>{await p.waitForTimeout(ms);await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{});};
await login(p); await settle(5000);
for (const path of ["/he/planner/semester","/he/calendar","/he/exam-planner"]) {
  await p.goto(`${BASE}${path}`,{waitUntil:"networkidle"}); await settle();
  const hits = await p.evaluate(() => [...document.querySelectorAll("button,a")]
    .map((e)=>({t:(e.innerText||e.getAttribute("aria-label")||"").replace(/\s+/g," ").trim(), vis:e.getBoundingClientRect().height>0, tag:e.tagName}))
    .filter((x)=>/ics|יומן|ICS/i.test(x.t)));
  console.log(`\n${path}:`, JSON.stringify(hits, null, 1));
}
await b.close();
