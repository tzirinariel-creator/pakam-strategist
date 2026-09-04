// ============================================================
// זריעת שנה ב׳/ג׳ בלי ה-AI — דרך שנת תחילת התואר
// ------------------------------------------------------------
// ב-5.9 המפתח המשותף של Gemini הגיע ל-429 וסריקת הגיליון נכשלה שוב
// ושוב, כך שהמסלול הכבד של y2/y3 נחסם. אבל שנת הלימוד נגזרת מ-
// `startYear` (deriveYearOfStudy), וההגדרות הן מסלול כתיבה אמיתי
// של המוצר. זורעים שנה א׳ כרגיל, ואז מזיזים את שנת ההתחלה אחורה.
//
//   node video/persona-seed-year.mjs --persona y2|y3
// ============================================================
import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const arg=(f,d)=>process.argv.includes(f)?process.argv[process.argv.indexOf(f)+1]:d;
const P=arg("--persona","y2");
const WANT_YEAR = P==="y3" ? "שנה ג׳" : "שנה ב׳";

const { b, p, errors } = await openApp({ width: 1440, height: 1100 });
const T=async()=>(await p.locator("body").innerText()).replace(/\s+/g," ");
try {
  await login(p); await p.waitForTimeout(5000);
  await p.goto(`${BASE}/he/settings`,{waitUntil:"domcontentloaded"});
  await p.waitForFunction(()=>document.body.innerText.length>2000, null, {timeout:45000}).catch(()=>{});
  await p.waitForTimeout(6000);

  // בורר שנת תחילת התואר — Radix, לא <select> מקורי: כפתור שפותח רשימה.
  // **רק** הבורר הזה. הפסיק בסלקטור הקודם הפך אותו לרשימה, ו-.first()
  // תפס את בורר רמת האנגלית שיושב לפניו ב-DOM.
  const trigger = p.locator('[aria-labelledby="settings-start-year-label"]').first();
  if (!(await trigger.count())) throw new Error("לא נמצא בורר שנת תחילת התואר");
  await trigger.scrollIntoViewIfNeeded().catch(()=>{});
  console.log("הבורר מציג כרגע:", (await trigger.innerText().catch(()=>""))?.trim());
  await trigger.click();
  await p.waitForTimeout(1500);
  const want = P === "y3" ? /תשפ״ה|2024/ : /תשפ״ו|2025/;
  const items = p.locator('[role="option"]');
  const n = await items.count();
  const labels = [];
  let picked = null;
  for (let i = 0; i < n; i++) {
    const txt = (await items.nth(i).innerText().catch(()=>"")).trim();
    labels.push(txt);
    if (!picked && want.test(txt)) picked = i;
  }
  if (picked == null) throw new Error(`אין אפשרות תואמת ל-${P}. יש: ${labels.join(" · ")}`);
  await items.nth(picked).click();
  await p.waitForTimeout(2000);
  console.log(`נבחר: ${labels[picked]}`);

  const save = p.getByRole("button",{name:/שמרו פרופיל/}).first();
  if (await save.count()) { await save.click().catch(()=>{}); await p.waitForTimeout(5000); }

  await p.goto(`${BASE}/he/dashboard`,{waitUntil:"domcontentloaded"});
  await p.waitForFunction(()=>document.body.innerText.length>800, null, {timeout:45000}).catch(()=>{});
  await p.waitForTimeout(5000);
  const t=await T();
  const got=(t.match(/שנה [א-ג]׳/)||["?"])[0];
  console.log(`מצב סופי: ${got} ${got===WANT_YEAR?"✅":"❌ ביקשתי "+WANT_YEAR}`);
  await shot(p,`seed-year-${P}`);
  console.log("שגיאות:", errors.length?[...new Set(errors)].slice(0,2).join(" | "):"אין");
  if (got!==WANT_YEAR) process.exit(3);
} finally { await b.close(); }
