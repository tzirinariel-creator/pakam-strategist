import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
await p.goto(`${BASE}/he/admin/sync`, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(9000);
console.log("=== לפני ===");
const before = await p.evaluate(() => document.body.innerText);
const bi = before.indexOf("סנכרון ידיעון");
console.log(before.slice(bi, bi + 900).replace(/\n{3,}/g, "\n"));

const clicked = await p.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((e) => /הרץ סנכרון/.test(e.innerText));
  if (!btn) return false; btn.click(); return true;
});
console.log("\nלחצתי על 'הרץ סנכרון':", clicked);
await p.waitForFunction(() => !/מסנכרן|טוען/.test(document.body.innerText), null, { timeout: 180000 }).catch(()=>console.log("(פג הזמן)"));
await p.waitForTimeout(20000);
await shot(p, "sync-after-fix", { full: true });
const after = await p.evaluate(() => document.body.innerText);
const ai = after.indexOf("סנכרון ידיעון");
console.log("\n=== אחרי ===");
console.log(after.slice(ai, ai + 2200).replace(/\n{3,}/g, "\n"));
console.log("\n=== שגיאות JS ===\n" + (errors.slice(0,6).join("\n") || "אין"));
await b.close();
