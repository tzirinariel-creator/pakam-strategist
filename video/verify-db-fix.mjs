// אימות חי של תיקוני המסד — כמשתמש, בקטלוג ובמסך התכנון.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1000 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

await p.goto(`${BASE}/he/catalog`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(11000);
const hits = await p.evaluate(() => {
  const rows = [...document.querySelectorAll("tr,li,div")].map((e) => e.innerText || "");
  const find = (s) => rows.some((t) => t.includes(s));
  return {
    contracts: find("דיני חוזים"),
    comparative: find("פוליטיקה השוואתית"),
    integrative: find("קורס אינטגרטיבי לפכ״מ") || find('קורס אינטגרטיבי לפכ"מ'),
    seminarB: find("סמינר פכ״מ: התמחות מעשית") || find('סמינר פכ"מ: התמחות מעשית'),
    oldSeminar: find("סמינר פכ״מ ב׳"),
    oldMind: find("פילוסופיה של התודעה"),
    newMind: find("פילוסופיה של הנפש"),
  };
});
console.log("=== בקטלוג ===");
for (const [k, v] of Object.entries(hits)) console.log(`  ${v ? "✅" : "❌"} ${k}`);
await shot(p, "V69-db-catalog", { full: true });

// חיפוש ממוקד לדיני חוזים
const box = p.locator('input[placeholder*="חיפוש"]').first();
if (await box.count()) {
  await box.fill("דיני חוזים");
  await p.waitForTimeout(2500);
  const t = await p.evaluate(() => document.body.innerText);
  const i = t.indexOf("דיני חוזים");
  console.log("\n=== חיפוש 'דיני חוזים' ===\n" + (i < 0 ? "לא נמצא" : t.slice(i - 120, i + 200)));
  await shot(p, "V69-db-contracts");
}
console.log("\n=== שגיאות ===", errors.slice(0, 4).join("\n") || "אין");
await b.close();
