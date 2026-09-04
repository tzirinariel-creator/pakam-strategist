import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1100 });
const settle = async (ms=6000) => { await p.waitForTimeout(ms); await p.waitForFunction(()=>!document.querySelector("[class*=animate-pulse]"),{timeout:45000}).catch(()=>{}); };
await login(p); await settle();
for (const path of ["/he/planner", "/he/planner/semester", "/he/exam-planner"]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); await settle(7000);
  const els = await p.evaluate(() => [...document.querySelectorAll("button,a")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => `${e.tagName[0]}:${(e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g," ").trim().slice(0,42)}`)
    .filter((x) => x.length > 2));
  console.log(`\n════ ${path} ════`);
  console.log([...new Set(els)].join("\n"));
}
await b.close();
