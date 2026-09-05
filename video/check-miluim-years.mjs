// A2 — האם יש בכלל דרך להזין סמסטר מילואים קודם, ואילו שנים מוצעות.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
await p.goto(`${BASE}/he/miluim`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);
await shot(p, "V69-A2-miluim", { full: true });
const sel = await p.evaluate(() =>
  [...document.querySelectorAll("select")].map((s) => ({
    label: (s.getAttribute("aria-label") || s.closest("label")?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
    options: [...s.options].map((o) => o.text),
  })));
console.log("בוררים במסך המילואים:");
for (const s of sel) console.log(`  ${s.label} → ${s.options.join(" · ")}`);
const t = await p.evaluate(() => document.body.innerText);
const i = t.indexOf("הוסיפו סמסטר");
console.log("\n--- סביב טופס ההוספה ---\n" + (i < 0 ? "(לא נמצא)" : t.slice(Math.max(0, i - 400), i + 260)));
await b.close();
