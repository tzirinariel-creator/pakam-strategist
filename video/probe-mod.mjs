import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
for (const path of ["/he/admin/moderation", "/he/admin/sync"]) {
  const t0 = Date.now();
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch((e)=>console.log("nav:", String(e).slice(0,80)));
  await p.waitForTimeout(12000);
  const txt = await p.evaluate(() => document.body.innerText);
  const i = txt.indexOf("הגדרות");
  console.log(`\n${"═".repeat(56)}\n═══ ${path}  (${Date.now()-t0}ms, ${txt.length} תווים)\n${"═".repeat(56)}`);
  console.log((i>0 ? txt.slice(i+8) : txt).replace(/\n{3,}/g,"\n\n").slice(0, 3000));
  await shot(p, "audit" + path.replace(/\//g, "-"), { full: true });
}
console.log("\n=== שגיאות JS ===\n" + (errors.slice(0,10).join("\n") || "אין"));
await b.close();
