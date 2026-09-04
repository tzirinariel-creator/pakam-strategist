import { openApp, login, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1000 });
await login(p); await p.waitForTimeout(5000);
await p.goto(`${BASE}/he/lineage`, { waitUntil: "networkidle" }); await p.waitForTimeout(9000);
const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
const i = t.indexOf("שגיאה");
console.log("מופע 'שגיאה':", i >= 0 ? `«${t.slice(Math.max(0,i-90), i+90)}»` : "לא מופיע");
console.log("אורך:", t.length);
await b.close();
