// אבחון ממוקד להערות של אריאל מ-5.9 — מצלם ומודד את המסכים שהוא ציין.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
import { mkdirSync } from "node:fs";

const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

const go = async (path) => {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 400, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(2500);
};

const txt = () => p.evaluate(() => document.body.innerText.replace(/\n{3,}/g, "\n\n"));

console.log("═══════ /graduation ═══════");
await go("/he/graduation");
await shot(p, "D-graduation-top", { full: true });
console.log((await txt()).slice(0, 4000));

console.log("\n═══════ /calendar ═══════");
await go("/he/calendar");
await shot(p, "D-calendar", { full: true });
console.log((await txt()).slice(0, 2500));

console.log("\n═══════ /miluim ═══════");
await go("/he/miluim");
await shot(p, "D-miluim", { full: true });
console.log((await txt()).slice(0, 2500));

console.log("\n═══════ /dashboard ═══════");
await go("/he/dashboard");
await shot(p, "D-dashboard", { full: true });
console.log((await txt()).slice(0, 3500));

console.log("\n═══ שגיאות ═══");
console.log(errors.length ? errors.join("\n") : "אין");
await b.close();
