import { openApp, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
try {
  const t0=Date.now();
  await p.goto(`${BASE}/he/login`,{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(4000);
  console.log(`דף ההתחברות נטען ב-${((Date.now()-t0)/1000).toFixed(1)}s · ${p.url()}`);
  const btn=p.getByRole("button",{name:/התחברות עם דוא/});
  console.log("כפתור 'התחברות עם דוא״ל':", await btn.count() ? "✅ קיים" : "❌ חסר");
  if (await btn.count()) { await btn.click(); await p.waitForTimeout(1800); }
  await p.locator("input[type=email]").fill("test@pakamon.dev");
  await p.locator("input[type=password]").fill("test123456");
  const t1=Date.now();
  await p.locator("button[type=submit]").click();
  // מחכה לתוצאה כלשהי — הצלחה או שגיאה — במקום רק לניווט
  for (let i=0;i<40;i++){
    await p.waitForTimeout(1500);
    const u=p.url(), txt=(await p.locator("body").innerText()).replace(/\s+/g," ");
    if (/dashboard|onboard/.test(u)) { console.log(`✅ הועבר ל-${u} אחרי ${((Date.now()-t1)/1000).toFixed(1)}s`); break; }
    const err=txt.match(/[^.]{0,80}(שגיאה|לא הצלחנו|שגוי|נסו שוב|יותר מדי)[^.]{0,60}/);
    if (err) { console.log(`❌ הודעת שגיאה אחרי ${((Date.now()-t1)/1000).toFixed(1)}s: ${err[0].trim().slice(0,140)}`); break; }
    if (i===39) console.log(`⏳ אין ניווט ואין שגיאה אחרי ${((Date.now()-t1)/1000).toFixed(1)}s · URL=${u}`);
  }
  await shot(p,"login-probe");
  console.log("שגיאות JS:", [...new Set(errors)].filter(e=>!/ResizeObserver/.test(e)).slice(0,3).join(" | ")||"אין");
} finally { await b.close(); }
