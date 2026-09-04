import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1000, height: 900 });
await login(p);
await p.waitForFunction(() => !document.querySelector("[class*=animate-pulse]"), { timeout: 60000 }).catch(() => {});
await p.goto(`${BASE}/he/graduation`, { waitUntil: "networkidle" });
await p.waitForTimeout(7000);
const el = p.locator('input[aria-label="ציון יעד"]').first();
await el.scrollIntoViewIfNeeded();
await p.waitForTimeout(1000);
const box = await el.boundingBox();
await p.screenshot({ path: "video/shots/CALC-stepper.png", clip: { x: 20, y: Math.max(0, box.y - 260), width: 960, height: 520 } });
console.log("צילום: video/shots/CALC-stepper.png");
// גם סרגל המשקלים
const bar = p.locator("text=פירוט משקלים").first();
await bar.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
const bb = await bar.boundingBox();
await p.screenshot({ path: "video/shots/CALC-weights.png", clip: { x: 20, y: Math.max(0, bb.y - 30), width: 960, height: 260 } });
console.log("צילום: video/shots/CALC-weights.png");
await b.close();
