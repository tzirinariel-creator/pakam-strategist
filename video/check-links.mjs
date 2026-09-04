// כל קישור פנימי באפליקציה — ולאן הוא באמת מוביל.
// הסיור לוחץ כפתורים, לשוניות ומתגים. קישורים הם ניווט, והם נבדקים כאן:
// שאין קישור מת, ושאין מסך שאף סיור לא ביקר בו.
import { openApp, login, BASE } from "./tour-lib.mjs";
const ROUTES = ["/he/dashboard","/he/planner","/he/bidding","/he/regulations","/he/record",
  "/he/graduation","/he/miluim","/he/exam","/he/exam-planner","/he/calendar","/he/catalog",
  "/he/lineage","/he/guide","/he/settings","/he/cohort","/he/mentors"];
const { b, p } = await openApp({ width: 1440, height: 1100 });
const targets = new Map();
try {
  await login(p); await p.waitForTimeout(5000);
  for (const u of ROUTES) {
    await p.goto(`${BASE}${u}`,{waitUntil:"domcontentloaded"});
    await p.waitForFunction(()=>document.body.innerText.length>500, null, {timeout:35000}).catch(()=>{});
    await p.waitForTimeout(3500);
    const links = await p.evaluate(()=>[...document.querySelectorAll("main a[href]")]
      .map(a=>({href:a.getAttribute("href"), txt:(a.innerText||"").trim().slice(0,30)}))
      .filter(x=>x.href && !x.href.startsWith("#")));
    for (const l of links) {
      const k = l.href.split("?")[0];
      if (!targets.has(k)) targets.set(k, { from:[], txt:l.txt });
      targets.get(k).from.push(u.replace("/he/",""));
    }
    console.log(`${u.replace("/he/","").padEnd(14)} ${links.length} קישורים ב-main`);
  }
  console.log("\n=== יעדים פנימיים ===");
  const external=[], internal=[];
  for (const [href, v] of targets) (href.startsWith("http") ? external : internal).push([href, v]);
  for (const [href, v] of internal.sort()) {
    const known = ROUTES.some(r=>r.endsWith(href)) || href.startsWith("/planner") || href.startsWith("/he/");
    console.log(`${known?"✓":"?"} ${href.padEnd(28)} "${v.txt}" ← ${[...new Set(v.from)].join(", ")}`);
  }
  console.log("\n=== יעדים חיצוניים ===");
  for (const [href, v] of external) console.log(`  ${href.slice(0,60).padEnd(62)} "${v.txt}"`);
} finally { await b.close(); }
