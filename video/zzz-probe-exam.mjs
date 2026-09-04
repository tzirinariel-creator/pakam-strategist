// M54/M44/M45 — להסתכל על המסך, לא לנחש מהקוד
import { openApp, login, shot, measure, report, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp();
const settle = async (ms = 5000) => { await p.waitForTimeout(ms); await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 40000 }).catch(() => {}); };
await login(p); await settle();
for (const [path, name] of [["/he/exam-planner", "מתכנן-מבחנים"], ["/he/exam", "לוח-בחינות"]]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await settle();
  const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  console.log(`\n════ ${name} (${path}) ════`);
  console.log(t.slice(0, 900));
  console.log("צילום:", await shot(p, name, { full: true }));
  report(name, await measure(p), errors);
}
await b.close();
