// אימות חי: דלת הדמו ו"חינם" בדף הנחיתה, בלי התחברות
import { openApp, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
await p.goto(`${BASE}/he`, { waitUntil: "networkidle" });
await p.waitForTimeout(4000);
const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
const peek = p.getByRole("button", { name: /להציץ בלי להירשם/ }).first();
console.log("«להציץ בלי להירשם»:", await peek.count() ? "✅ קיים בדף הנחיתה" : "❌ חסר");
console.log("«חינם» ליד הכפתור:", /חינם, בלי כרטיס אשראי/.test(t) ? "✅ קיים" : "❌ חסר");
const y = await p.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(e=>/להציץ בלי להירשם/.test(e.innerText));
  const cta = [...document.querySelectorAll("a")].find(e=>/^מתחילים/.test(e.innerText.trim()));
  return { peekTop: b?Math.round(b.getBoundingClientRect().top):null, ctaTop: cta?Math.round(cta.getBoundingClientRect().top):null };
});
console.log(`מיקום: הכפתור הראשי ב-${y.ctaTop}px · דלת הדמו ב-${y.peekTop}px (מעל הקפל)`);
console.log(await shot(p, "V-marketing-hero"));
// והדלת באמת עובדת?
if (await peek.count()) {
  await peek.click();
  await p.waitForURL(/dashboard/, { timeout: 60000 }).catch(()=>{});
  await p.waitForTimeout(9000);
  const t2 = (await p.locator("body").innerText()).replace(/\s+/g," ");
  console.log("\nאחרי לחיצה — URL:", p.url().replace(BASE,""));
  console.log("על המסך:", t2.slice(0, 220));
  console.log(await shot(p, "V-marketing-demo"));
}
console.log("שגיאות:", errors.length ? [...new Set(errors)].join(" | ") : "אין");
await b.close();
