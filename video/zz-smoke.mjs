import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const PAGES=[["/he/dashboard","בית"],["/he/planner","תכנון התואר"],["/he/bidding","בידינג"],
 ["/he/regulations","דרישות התואר"],["/he/record","התיק האקדמי"],["/he/graduation","ציון גמר"],
 ["/he/exam-planner","תכנון מבחנים"],["/he/exam","לוח בחינות"],["/he/calendar","יומן"],
 ["/he/catalog","קטלוג"],["/he/lineage","השושלת"],["/he/guide","מדריך"],["/he/settings","הגדרות"],
 ["/he/miluim","מילואים"],["/he/cohort","תיק המחזור"],["/he/mentors","מנטורים"]];
const b=await chromium.launch();
for (const [w,label] of [[1440,"דסקטופ"],[390,"נייד"]]) {
  const ctx=await b.newContext({viewport:{width:w,height:w===390?844:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem",
    isMobile:w===390,hasTouch:w===390});
  const p=await ctx.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,90)));
  await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
  await p.getByRole("button",{name:/התחברות עם דוא/}).click();
  await p.locator('input[type=email]').fill("test@pakamon.dev");
  await p.locator('input[type=password]').fill("test123456");
  await p.locator('button[type=submit]').click();
  await p.waitForURL(/dashboard/,{timeout:45000});
  console.log(`\n########## ${label} (${w}px) ##########`);
  for (const [path,name] of PAGES) {
    try {
      const r=await p.goto(`${BASE}${path}`,{waitUntil:"networkidle",timeout:45000});
      await p.waitForTimeout(3500);
      const t=await p.locator("body").innerText();
      const over=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
      const bad=/שגיאה כללית|Application error|Something went wrong|undefined|NaN|\[object Object\]/.test(t);
      const empty=t.trim().length<400;
      const flags=[r.status()!==200?`HTTP ${r.status()}`:null, over?"גלישה→":null, bad?"טקסט חשוד":null, empty?"ריק":null].filter(Boolean);
      console.log(`  ${flags.length?"⚠️ ":"✓ "}${name.padEnd(14)} ${t.trim().length.toString().padStart(5)} תווים ${flags.join(" · ")}`);
    } catch(e){ console.log(`  ✗ ${name.padEnd(14)} ${String(e).slice(0,70)}`); }
  }
  console.log(`  שגיאות JS: ${errs.length?[...new Set(errs)].join(" | "):"אין"}`);
  await ctx.close();
}
await b.close();
