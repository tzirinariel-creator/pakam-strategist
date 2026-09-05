// רינדור כרטיס הקישור מ-SVG ל-PNG, ברוחב המדויק שוואטסאפ ולינקדאין מצפים לו.
// דרך דפדפן אמיתי, כדי שהעברית תיפול על אותם גופנים שהמשתמש רואה.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const req = createRequire(import.meta.url);
const { chromium } = req("../video/node_modules/playwright");

const svg = readFileSync(fileURLToPath(new URL("../public/og-image.svg", import.meta.url)), "utf-8");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(
  `<!doctype html><meta charset="utf-8">
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&display=swap">
   <style>html,body{margin:0;padding:0;width:1200px;height:630px;overflow:hidden}</style>${svg}`,
  { waitUntil: "networkidle" }
);
await p.waitForTimeout(2500);
await p.screenshot({ path: fileURLToPath(new URL("../public/og-image.png", import.meta.url)) });
await b.close();
// 1x בכוונה. ב-2x הקובץ יצא 416KB, ווואטסאפ עלול לוותר על תצוגה כבדה —
// ואז הקישור נראה כמו טקסט יבש בדיוק בקבוצות שבהן הוא רץ בשבוע הבידינג.
// 1200×630 הוא גם בדיוק מה שהמטא-דאטה מצהירה.
console.log("✅ public/og-image.png נוצר (1200×630)");
