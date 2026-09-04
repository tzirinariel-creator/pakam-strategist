// אימות המעבר ל-transaction mode (6543 + pgbouncer) על פרודקשן חי.
// לא רק "המסד עונה" — קריאות כבדות, שאילתות מקבילות, וכתיבה אמיתית.
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const T = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const go = async (u, ms = 6000) => {
  const t0 = Date.now();
  await p.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.body.innerText.length > 700, null, { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(ms);
  return ((Date.now() - t0) / 1000).toFixed(1);
};
try {
  await login(p);
  console.log("התחברות:", p.url().includes("dashboard") ? "✅" : "❌ " + p.url());
  let bad = 0;
  for (const [u, label] of [["/he/dashboard","לוח"],["/he/planner","תכנון"],["/he/bidding","בידינג"],
                            ["/he/record","תיק"],["/he/catalog","קטלוג (345 קורסים)"],
                            ["/he/regulations","דרישות"],["/he/graduation","ציון גמר"],["/he/miluim","מילואים"]]) {
    const secs = await go(u, 4500);
    const t = await T();
    const ok = t.length > 900 && !/שגיאה|לא הצלחנו לטעון|משהו השתבש/.test(t);
    if (!ok) bad++;
    console.log(`${ok ? "✅" : "❌"} ${label.padEnd(20)} ${secs}s · ${t.length} תווים`);
  }
  // כתיבה אמיתית — ההוכחה שטרנזקציות עובדות ב-transaction mode
  await go("/he/record", 7000);
  const g = p.locator('main input[type="number"]').first();
  let write = "לא נמצא שדה";
  if (await g.count()) {
    const was = await g.inputValue();
    const val = was === "77" ? "82" : "77";
    await g.fill(val); await p.waitForTimeout(4000);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.body.innerText.length > 700, null, { timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(6000);
    const after = await p.locator('main input[type="number"]').first().inputValue();
    write = after === val ? `✅ ${was || "ריק"} → ${val}, שרד רענון` : `❌ נכתב ${val} אך אחרי רענון ${after}`;
  }
  console.log(`\nכתיבה למסד: ${write}`);
  await shot(p, "verify-6543");
  const js = [...new Set(errors)].filter(e => !/ResizeObserver/.test(e));
  console.log(`שגיאות JS: ${js.length ? js.slice(0,2).join(" | ") : "אין"}`);
  console.log(`\n${bad === 0 && write.startsWith("✅") ? "✅ המעבר ל-6543 תקין" : "‼️ יש בעיה — שקול גלגול לאחור"}`);
} finally { await b.close(); }
