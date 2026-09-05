// סקירת כל שלושת מסכי הניהול — טקסט מלא, צילום, ומדידה.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

const PAGES = [
  ["/he/admin", "סקירה", "admin-audit-overview"],
  ["/he/admin/moderation", "מודרציה", "admin-audit-moderation"],
  ["/he/admin/sync", "סנכרון", "admin-audit-sync"],
];

for (const [path, label, shotName] of PAGES) {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 700, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await shot(p, shotName, { full: true });
  const t = await p.evaluate(() => document.body.innerText);
  // חותכים את הסרגל הקבוע כדי לראות את התוכן
  const i = t.indexOf("הגדרות");
  const body = i > 0 ? t.slice(i + 8) : t;
  console.log(`\n${"═".repeat(60)}\n═══ ${label} · ${path}\n${"═".repeat(60)}`);
  console.log(body.replace(/\n{3,}/g, "\n\n").slice(0, 4500));
}
console.log("\n═══ שגיאות JS ═══");
console.log(errors.length ? errors.slice(0, 10).join("\n") : "אין");
await b.close();
