import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
const problems = [];
for (const [path, label, name] of [
  ["/he/admin", "סקירה", "final-admin-overview"],
  ["/he/admin/moderation", "מודרציה", "final-admin-moderation"],
  ["/he/admin/sync", "סנכרון", "final-admin-sync"],
]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(11000);
  await shot(p, name, { full: true });
  const m = await p.evaluate(() => {
    const out = { ox: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2, tiny: [], noName: [] };
    for (const el of document.querySelectorAll("button,a,[role=button]")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const nm = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
      if (r.height < 24 || r.width < 24) out.tiny.push(`${Math.round(r.width)}×${Math.round(r.height)} "${nm.slice(0,24)}"`);
      if (!nm) out.noName.push(el.className?.toString().slice(0, 40));
    }
    out.tiny = [...new Set(out.tiny)].slice(0, 6); out.noName = [...new Set(out.noName)].slice(0, 4);
    return out;
  });
  const t = await p.evaluate(() => document.body.innerText);
  console.log(`\n═══ ${label} ═══`);
  console.log(`  גלישה: ${m.ox ? "❌" : "✅"} · יעדי מגע: ${m.tiny.length ? "❌ " + m.tiny.join(" · ") : "✅"} · שם נגיש: ${m.noName.length ? "❌ " + m.noName.join(" · ") : "✅"}`);
  // סתירות ידועות
  const both = t.includes("הכול מעודכן") && /שגיאות \(\d+\)/.test(t);
  console.log(`  "הכול מעודכן" יחד עם שגיאות: ${both ? "❌ עדיין" : "✅ לא"}`);
  if (m.ox) problems.push(`${label}: גלישה`);
  if (m.tiny.length) problems.push(`${label}: יעדי מגע`);
  if (m.noName.length) problems.push(`${label}: שם נגיש`);
  if (both) problems.push(`${label}: סתירה`);
}
console.log("\n=== שגיאות JS ===\n" + (errors.slice(0,8).join("\n") || "אין"));
console.log(`\n═══ ${problems.length ? "❌ " + problems.join(" | ") : "✅ נקי"} ═══`);
await b.close();
