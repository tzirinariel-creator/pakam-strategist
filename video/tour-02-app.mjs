import { openApp, login, shot, measure, report, BASE } from "./tour-lib.mjs";
import fs from "node:fs";

const mobile = process.argv.includes("--mobile");
const tag = mobile ? "m" : "d";
const { b, p, errors } = await openApp(mobile ? { width:390, height:844, mobile:true } : {});
const findings = [];

const ROUTES = [
  ["/he/dashboard","בית"], ["/he/planner","תכנון התואר"], ["/he/bidding","בידינג"],
  ["/he/regulations","דרישות התואר"], ["/he/record","התיק האקדמי"], ["/he/graduation","מחשבון ציון גמר"],
  ["/he/exam-planner","תכנון מבחנים"], ["/he/exam","לוח בחינות"], ["/he/calendar","יומן"],
  ["/he/catalog","קטלוג קורסים"], ["/he/lineage","השושלת"], ["/he/guide","מדריך מתחיל"],
  ["/he/settings","הגדרות"], ["/he/miluim","מילואים"], ["/he/cohort","תיק המחזור"],
  ["/he/mentors","מנטורים"], ["/he/record?scan=1","סריקת גיליון"],
];

function note(where, what) { findings.push({ where, what }); console.log(`      ‼ ${what}`); }

await login(p);
for (const [route, name] of ROUTES) {
  await p.goto(`${BASE}${route}`, { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(4200);
  await shot(p, `${tag}-${name.replace(/[ \/]/g,"_")}`);
  const m = await measure(p);
  report(`${name}`, m, errors);
  if (m.overflowX) note(name, "גלישה אופקית");
  for (const c of m.clipped) note(name, `טקסט חתוך: ${c}`);
  for (const t of m.tinyText) note(name, `משפט קטן: ${t}`);
  for (const t of m.tinyTargets) note(name, `יעד/שם: ${t}`);

  // כל הטאבים במסך
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(x=>x.innerText.trim()).filter(Boolean));
  for (const [i, tabName] of tabs.entries()) {
    if (i > 5) break;
    const el = p.getByRole("tab", { name: tabName }).first();
    if (!(await el.count())) continue;
    await el.click().catch(()=>{}); await p.waitForTimeout(2800);
    await shot(p, `${tag}-${name.replace(/[ \/]/g,"_")}-tab-${tabName.replace(/[ \/]/g,"_").slice(0,18)}`);
    const mm = await measure(p);
    report(`  ${name} › ${tabName}`, mm, errors);
    if (mm.overflowX) note(`${name}›${tabName}`, "גלישה אופקית");
    for (const c of mm.clipped) note(`${name}›${tabName}`, `טקסט חתוך: ${c}`);
  }
}
fs.writeFileSync(`report-${tag}.json`, JSON.stringify(findings, null, 1));
console.log(`\n═══ ${findings.length} ממצאים · report-${tag}.json ═══`);
await b.close();
