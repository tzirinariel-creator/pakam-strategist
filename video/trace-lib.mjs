// ============================================================
// גלאי מסכי־טעינה תקועים: דוגם את המסך כל 500ms ורושם ציר זמן
// ------------------------------------------------------------
// L1/N5 ("מסך טעינה שלא עבד לי 3 פעמים") הוא באג של זמן, לא של פיקסלים.
// צילום בודד לעולם לא יתפוס אותו. הגלאי הזה רושם כמה זמן כל מסך החזיק,
// ומצלם כל מצב־טעינה שעבר את הסף.
// ============================================================
import { shot } from "./tour-lib.mjs";

const SPIN = /animate-spin|role="status"/;

/** חתימת מסך: URL + כותרת נראית + האם יש ספינר */
async function signature(p) {
  return p.evaluate(() => {
    const spinning = !!document.querySelector(".animate-spin,[role=status]");
    const txt = (document.body.innerText || "").replace(/\s+/g, " ").trim();
    // הכותרת הראשונה הנראית — מזהה את המסך בלי להיות רגישה לכל תו.
    // מדלג על משפט הפרטיות הקבוע בסרגל, שמופיע בכל מסך ומשטח את הציר.
    const skip = /זה לא אתר רשמי|^פכמון$/;
    const head = [...document.querySelectorAll("h1,h2,h3")]
      .map((e) => (e.innerText || "").trim())
      .filter((t) => t && !skip.test(t))[0]
      || [...document.querySelectorAll("p")]
        .map((e) => (e.innerText || "").trim())
        .filter((t) => t && !skip.test(t))[0]
      || (document.querySelector("[class*=skeleton],[class*=animate-pulse]") ? "(שלד טעינה)" : "(ריק)");
    const skeleton = !!document.querySelector("[class*=animate-pulse]");
    return { spinning: spinning || skeleton, head: head.slice(0, 70), len: txt.length, txt: txt.slice(0, 400) };
  }).catch(() => ({ spinning: false, head: "(ניווט)", len: 0, txt: "" }));
}

/**
 * עוקב אחרי המסך במשך `ms` ומדפיס ציר זמן.
 * מחזיר { states, stuck } — stuck = מצבי טעינה שעברו את הסף.
 */
export async function trace(p, label, { ms = 30000, every = 500, stuckAfter = 8000, snap = true } = {}) {
  const t0 = Date.now();
  const states = [];
  let cur = null;
  console.log(`\n── ציר זמן · ${label} ──`);
  while (Date.now() - t0 < ms) {
    const s = await signature(p);
    const url = p.url().replace(/^https?:\/\/[^/]+/, "");
    const key = `${url}|${s.head}|${s.spinning}`;
    if (!cur || cur.key !== key) {
      if (cur) cur.until = Date.now();
      cur = { key, url, head: s.head, spinning: s.spinning, from: Date.now(), until: null, txt: s.txt };
      states.push(cur);
      const at = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${String(at).padStart(5)}s  ${s.spinning ? "⏳" : "  "} ${url}  «${s.head}»`);
    }
    await p.waitForTimeout(every);
  }
  if (cur) cur.until = Date.now();

  const stuck = [];
  for (const st of states) {
    const held = (st.until - st.from) / 1000;
    st.held = held;
    if (st.spinning && st.until - st.from >= stuckAfter) stuck.push(st);
  }
  console.log("  ── סיכום ──");
  for (const st of states) {
    console.log(`  ${st.held.toFixed(1).padStart(6)}s  ${st.spinning ? "⏳ טעינה" : "        "}  ${st.url} «${st.head}»`);
  }
  if (stuck.length) {
    console.log(`  ‼️  ${stuck.length} מצבי טעינה מעל ${stuckAfter / 1000}s:`);
    for (const st of stuck) console.log(`      ${st.held.toFixed(1)}s · ${st.url} «${st.head}»`);
    if (snap) console.log("  " + (await shot(p, `STUCK-${label}`)));
  }
  return { states, stuck };
}

/** ממתין עד שטקסט מופיע, ומחזיר כמה זמן זה לקח (או null אם לא הופיע) */
export async function waitFor(p, re, ms = 60000) {
  const t0 = Date.now();
  try {
    await p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: ms });
    return (Date.now() - t0) / 1000;
  } catch { return null; }
}
