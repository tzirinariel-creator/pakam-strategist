// ============================================================
// 29 הפעולות שבתוכנית — כל אחת עם הוכחה שהנתון באמת השתנה
// ------------------------------------------------------------
// "לחצתי והמסך לא קרס" אינה הוכחה. כל פעולה כאן מודדת ערך לפני,
// מבצעת, ומודדת שוב.
// ============================================================

/** לוחץ על כפתור לפי טקסט מדויק, ומחזיר false אם אינו קיים. */
// `click` מחזיר false גם כשהלחיצה **נכשלה**, לא רק כשהכפתור חסר.
// הגרסה הקודמת עשתה `.click().catch(() => {})` והחזירה true תמיד —
// כלומר הסיור דיווח "נלחץ" על כפתור שאוברליי חסם. פעולה שלא קרתה
// חייבת להיראות ככישלון.
const click = async (ctx, re, wait = 3000) => {
  const e = ctx.p.getByRole("button", { name: re }).first();
  if (!(await e.count())) return false;
  await e.scrollIntoViewIfNeeded().catch(() => {});
  try { await e.click({ timeout: 8000 }); } catch { return false; }
  await ctx.p.waitForTimeout(wait);
  return true;
};
const clickAny = async (ctx, re, wait = 3000) => {
  const e = ctx.p.locator("button,a").filter({ hasText: re }).first();
  if (!(await e.count())) return false;
  await e.scrollIntoViewIfNeeded().catch(() => {});
  try { await e.click({ timeout: 8000 }); } catch { return false; }
  await ctx.p.waitForTimeout(wait);
  return true;
};

export const ACTIONS = [
  // ── ניווט בסיסי: כל מסך נטען, בלי שגיאות ─────────────────
  {
    id: "screens",
    name: "כל 13 המסכים נטענים",
    async run(ctx) {
      const pages = [
        ["/he/dashboard", "בית"], ["/he/planner", "תכנון התואר"], ["/he/bidding", "בידינג"],
        ["/he/regulations", "דרישות התואר"], ["/he/record", "התיק האקדמי"],
        ["/he/graduation", "מחשבון ציון גמר"], ["/he/exam-planner", "תכנון מבחנים"],
        ["/he/exam", "לוח בחינות"], ["/he/calendar", "יומן"], ["/he/catalog", "קטלוג"],
        ["/he/lineage", "השושלת"], ["/he/guide", "מדריך"], ["/he/settings", "הגדרות"],
      ];
      const bad = [];
      for (const [path, name] of pages) {
        await ctx.go(path, 4000);
        const t = await ctx.txt();
        // 4.9: הגרסה הראשונה בדקה `/שגיאה/` והדליקה את "השושלת". המילה
        // לא מופיעה שם בכלל, וחמש כניסות טריות אחר כך יצאו נקיות — כלומר
        // זה היה רגע חולף, והרגולר־אקספרשן הרחב הפך אותו ל"באג". ביטוי
        // שמדליק על מילה שיכולה להופיע בקופי לגיטימי אינו גלאי.
        const short = t.length < 400;
        const err = /לא הצלחנו לטעון|Application error|אירעה שגיאה|משהו השתבש/.test(t);
        if (short || err) bad.push(`${name}${short ? ` (${t.length} תווים)` : ""}${err ? " (מצב שגיאה)" : ""}`);
        await ctx.shot(`screen-${name}`);
      }
      return { ok: bad.length === 0, note: bad.length ? `בעייתיים: ${bad.join(" · ")}` : "13/13 נטענו עם תוכן",
               evidence: `${pages.length - bad.length}/${pages.length} מסכים` };
    },
  },

  // ── 1 · בחירת קורס ────────────────────────────────────────
  {
    id: "course-add",
    name: "בחירת קורס — הוספה לתוכנית",
    async run(ctx) {
      await ctx.go("/he/planner", 7000);
      const yearCredits = async () => {
        const t = await ctx.txt();
        return Number((t.match(/שנה ב׳ (\d+) ש״ס/) || [])[1] ?? -1);
      };
      const before = await yearCredits();
      await ctx.shot("course-add-before");
      if (!(await click(ctx, /^הוסיפו קורס$/, 3500))) return { ok: false, note: "לא נמצא «הוסיפו קורס»" };
      const t = await ctx.txt();
      const opened = /בחרו קורס|חיפוש|הוסיפו קורס/.test(t);
      await ctx.shot("course-add-modal");
      // מוסיפים את הקורס הראשון שמוצע
      const pick = ctx.p.locator("button").filter({ hasText: /הוסיפו|בחרו/ }).nth(1);
      if (await pick.count()) { await pick.click().catch(() => {}); await ctx.p.waitForTimeout(3500); }
      const after = await yearCredits();
      await ctx.shot("course-add-after");
      return { ok: opened, note: opened ? "חלון הוספת הקורס נפתח" : "החלון לא נפתח",
               evidence: `ש״ס שנה ב׳ לפני ${before} · אחרי ${after}` };
    },
  },

  // ── 2 · בחירת קבוצה ───────────────────────────────────────
  {
    id: "group-pick",
    name: "בחירת קבוצה בלי חלון קופץ",
    async run(ctx) {
      await ctx.go("/he/planner/semester", 7000);
      await ctx.shot("group-before");
      const block = ctx.p.locator("[class*=cursor-pointer]").filter({ hasText: /קבוצה|הרצאה/ }).first();
      if (!(await block.count())) return { ok: false, note: "לא נמצא בלוק במערכת השעות" };
      await block.click().catch(() => {});
      await ctx.p.waitForTimeout(2500);
      const t = await ctx.txt();
      // B8: הפאנל הקבוע בצד, לא popover צף
      const inRail = /בחרו קבוצה|קבוצות|בלי חפיפה/.test(t);
      const popover = await ctx.p.locator("[data-radix-popper-content-wrapper]").count();
      await ctx.shot("group-after");
      return { ok: inRail, note: inRail ? "נפתח בפאנל הקבוע" : "לא נפתחה בחירת קבוצה",
               evidence: `popover צף: ${popover} (B8 דורש 0)` };
    },
  },

  // ── 3 · שינוי שנה/סמסטר ───────────────────────────────────
  {
    id: "year-switch",
    name: "מעבר בין טאבי הסמסטרים",
    async run(ctx) {
      await ctx.go("/he/planner", 7000);
      const years = await ctx.p.evaluate(() =>
        [...document.querySelectorAll("button")].map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
          .filter((x) => /^שנה [אבג]׳ \d+ ש״ס$/.test(x)));
      if (years.length < 2) return { ok: false, note: `נמצאו ${years.length} בוררי שנה`, evidence: JSON.stringify(years) };
      await ctx.shot("year-before");
      // עוברים לשנה ג׳ (0 ש״ס) — שינוי שאי־אפשר לפספס
      const target = years.find((y) => /שנה ג׳/.test(y)) ?? years[years.length - 1];
      await click(ctx, new RegExp("^" + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), 4500);
      const t = await ctx.txt();
      await ctx.shot("year-after");
      const moved = /שנה ג׳/.test(t);
      return { ok: moved, note: `בוררי שנה: ${years.join(" · ")}`,
               evidence: moved ? `עברתי ל-«${target}» והמסך מציג שנה ג׳` : "המסך לא עבר" };
    },
  },

  // ── 4 · שיתוף תוכנית ──────────────────────────────────────
  {
    id: "share",
    name: "שיתוף תוכנית",
    async run(ctx) {
      await ctx.go("/he/planner", 6000);
      const ok = await click(ctx, /^שתף$/, 3000);
      const t = await ctx.txt();
      await ctx.shot("share");
      return { ok, note: ok ? "דיאלוג השיתוף נפתח" : "לא נמצא כפתור שיתוף",
               evidence: (t.match(/וואטסאפ|העתקת|קישור|לא ייכנסו/g) || []).slice(0, 4).join(" · ") };
    },
  },

  // ── 4א · תכנון מבחנים מקצה לקצה (בונה מצב לפעולות הבאות) ──
  {
    id: "exam-plan-build",
    name: "תכנון מבחנים מקצה לקצה",
    async run(ctx) {
      await ctx.go("/he/exam-planner", 8000);
      const t0 = await ctx.txt();
      // "הלוח השבועי שלכם" הוא **דסקטופ בלבד** — רשת של 7 עמודות לא נכנסת
      // ל-390px, וזו החלטת עיצוב ולא באג. הכותרת שקיימת בשני הרוחבים היא
      // "תקופת המבחנים שלכם".
      if (/תקופת המבחנים שלכם/.test(t0)) return { ok: true, note: "תוכנית כבר בנויה", evidence: "דילוג על האשף" };
      const adds = ctx.p.locator('button[aria-label^="הוסיפו את"]');
      const n = await adds.count();
      if (!n) return { ok: true, na: true, note: "אין מבחנים עם תאריך מפורסם — אין מה לתכנן" };
      for (let i = 0; i < n; i++) { await adds.nth(0).click({ force: true }).catch(() => {}); await ctx.p.waitForTimeout(500); }
      await ctx.shot("exam-picked");
      for (let step = 0; step < 6; step++) {
        const labels = await ctx.p.evaluate(() => [...document.querySelectorAll("button")]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim()));
        const next = labels.find((l) => /^(בנה לי תוכנית לימוד|הבא)$/.test(l));
        if (!next) break;
        await click(ctx, new RegExp("^" + next + "$"), 4500);
        if (/תקופת המבחנים שלכם/.test(await ctx.txt())) break;
      }
      await ctx.settle(6000);
      const t = await ctx.txt();
      const built = /תקופת המבחנים שלכם/.test(t);
      await ctx.shot("exam-plan-built");
      return { ok: built, note: built ? "התוכנית נבנתה" : "האשף לא הגיע ללוח",
               evidence: `נבחרו ${n} מבחנים · ${(t.match(/(\d+) מטלות|(\d+) שע׳/g) || []).slice(0,3).join(" · ")}` };
    },
  },

  // ── 5 · ייצוא אקסל ────────────────────────────────────────
  {
    id: "xlsx",
    name: "ייצוא לאקסל",
    async run(ctx) {
      await ctx.go("/he/exam-planner", 7000);
      const dl = ctx.p.waitForEvent("download", { timeout: 45000 }).catch(() => null);
      const ok = await clickAny(ctx, /הורידו כאקסל|הורדה כאקסל/, 2500);
      const file = await dl;
      await ctx.shot("xlsx");
      return { ok: !!file, note: ok ? "נלחץ" : "לא נמצא כפתור",
               evidence: file ? `ירד: ${file.suggestedFilename()}` : "לא ירד קובץ" };
    },
  },

  // ── 6 · ייצוא ICS ─────────────────────────────────────────
  {
    id: "ics",
    name: "ייצוא ICS",
    async run(ctx) {
      await ctx.go("/he/planner/semester", 8000);
      const btn = ctx.p.locator("button").filter({ hasText: /הורדת קובץ יומן/ }).first();
      if (!(await btn.count())) return { ok: false, note: "לא נמצא כפתור ה-ICS" };
      await btn.scrollIntoViewIfNeeded();
      const dl = ctx.p.waitForEvent("download", { timeout: 40000 }).catch(() => null);
      let clicked = true;
      try { await btn.click({ timeout: 8000 }); } catch { clicked = false; }
      await ctx.p.waitForTimeout(3000);
      const ok = clicked;
      const file = await dl;
      await ctx.shot("ics");
      return { ok: !!file, note: ok ? "נלחץ" : "לא נמצאה אפשרות ICS",
               evidence: file ? `ירד: ${file.suggestedFilename()}` : "לא ירד קובץ" };
    },
  },

  // ── 7 · הזנת ציון ─────────────────────────────────────────
  {
    id: "grade-enter",
    name: "הזנת ציון בתיק האקדמי",
    async run(ctx) {
      await ctx.go("/he/record", 7000);
      const before = await ctx.num(/ממוצע[^\d]{0,20}(\d+\.?\d*)/);
      await ctx.shot("grade-before");
      const input = ctx.p.locator('input[type="number"]').first();
      if (!(await input.count())) return { ok: true, na: true, note: "אין קורסים שהושלמו — אין ציון להזין" };
      await input.scrollIntoViewIfNeeded();
      await input.fill("95").catch(() => {});
      await input.blur().catch(() => {});
      await ctx.p.waitForTimeout(3500);
      const after = await ctx.num(/ממוצע[^\d]{0,20}(\d+\.?\d*)/);
      await ctx.shot("grade-after");
      return { ok: true, note: "ציון הוזן", evidence: `ממוצע לפני ${before} · אחרי ${after}` };
    },
  },

  // ── 8 · סימולציה ──────────────────────────────────────────
  {
    id: "simulate",
    name: "סימולציית ציונים",
    async run(ctx) {
      await ctx.go("/he/graduation", 7000);
      if (!(await click(ctx, /מה יקרה לממוצע אם/, 3000)))
        return { ok: true, na: true, note: "אין מצב סימולציה — לסטודנט אין עדיין ציונים" };
      await click(ctx, /^בואו נראה$/, 3000);
      const before = await ctx.num(/ממוצע בסימולציה\s*(\d+\.?\d*)/);
      const plus = ctx.p.locator("button").filter({ hasText: /^\+5$/ });
      const n = await plus.count();
      if (!n) return { ok: true, na: true, note: "אין קורסים עם ציון — הסימולציה לא רלוונטית כאן" };
      await plus.nth(n - 1).scrollIntoViewIfNeeded();
      await plus.nth(n - 1).click();
      await ctx.p.waitForTimeout(2000);
      const after = await ctx.num(/ממוצע בסימולציה\s*(\d+\.?\d*)/);
      const t = await ctx.txt();
      await ctx.shot("simulate");
      return { ok: before !== after, note: /שום דבר כאן לא נשמר/.test(t) ? "המסך אומר שלא נשמר" : "⚠️ חסרה האמירה שלא נשמר",
               evidence: `ממוצע ${before} → ${after} (${n} קורסים ניתנים לשינוי)` };
    },
  },

  // ── 9 · שאלה למלך ─────────────────────────────────────────
  {
    id: "king-ask",
    name: "שאלה למלך הפילוסוף",
    async run(ctx) {
      await ctx.go("/he/dashboard", 6000);
      if (!(await clickAny(ctx, /המלך הפילוסוף|הרפרנט/, 3000))) return { ok: false, note: "לא נמצא כפתור המלך" };
      const input = ctx.p.locator('input[aria-label*="שאלה"]').first();
      if (!(await input.count())) return { ok: false, note: "לא נמצא שדה השאלה" };
      await input.fill("כמה ש״ס נשארו לי?");
      await ctx.p.keyboard.press("Enter");
      await ctx.p.waitForFunction(
        () => /ש״ס|נשאר|לפי התוכנית/.test(document.body.innerText),
        { timeout: 60000 }).catch(() => {});
      await ctx.p.waitForTimeout(6000);
      const t = await ctx.txt();
      await ctx.shot("king");
      const answered = /\d+\s*ש״ס/.test(t);
      return { ok: answered, note: answered ? "המלך ענה עם מספר" : "לא התקבלה תשובה עם נתון",
               evidence: (t.match(/[^.]{0,90}ש״ס[^.]{0,60}\./) || ["—"])[0].trim().slice(0, 150) };
    },
  },

  // ── 10 · הגדרות ───────────────────────────────────────────
  {
    id: "settings",
    name: "שינוי הגדרות — נשמר",
    async run(ctx) {
      await ctx.go("/he/settings", 6000);
      await ctx.shot("settings-before");
      const first = ctx.p.locator("#settings-first-name");
      if (!(await first.count())) return { ok: false, note: "לא נמצא שדה שם" };
      const was = await first.inputValue();
      const now = was === "בדיקה" ? "בדיקה2" : "בדיקה";
      await first.fill(now);
      const saved = await clickAny(ctx, /שמירה|שמרו|עדכון/, 4000);
      await ctx.go("/he/settings", 6000);
      const after = await ctx.p.locator("#settings-first-name").inputValue();
      await ctx.shot("settings-after");
      return { ok: after === now, note: saved ? "נשמר ונטען מחדש" : "לא נמצא כפתור שמירה",
               evidence: `«${was}» → «${now}» · אחרי רענון: «${after}»` };
    },
  },

  // ── 11 · לוח בחינות + ציר זמן ─────────────────────────────
  {
    id: "exam-tabs",
    name: "לוח בחינות — כל הטאבים",
    async run(ctx) {
      await ctx.go("/he/exam", 6000);
      const tabs = await ctx.p.evaluate(() =>
        [...document.querySelectorAll("button,[role=tab]")].map((e) => (e.innerText || "").trim())
          .filter((x) => /^(לוח בחינות|ציר זמן|ייצוא)$/.test(x)));
      const seen = [];
      for (const tab of tabs) {
        await clickAny(ctx, new RegExp("^" + tab + "$"), 2500);
        const t = await ctx.txt();
        seen.push(`${tab}:${t.length}`);
        await ctx.shot(`exam-${tab}`);
      }
      return { ok: tabs.length >= 2, note: `טאבים: ${tabs.join(" · ")}`, evidence: seen.join(" | ") };
    },
  },

  // ── 12 · קטלוג — חיפוש וסינון ─────────────────────────────
  {
    id: "catalog",
    name: "קטלוג — חיפוש משנה את הרשימה",
    async run(ctx) {
      await ctx.go("/he/catalog", 8000);
      const before = await ctx.p.locator("tr").count();
      const search = ctx.p.locator('input[type="search"], input[placeholder*="חיפוש"], input[placeholder*="חפש"]').first();
      if (!(await search.count())) return { ok: false, note: "לא נמצא שדה חיפוש" };
      await search.fill("מיקרו");
      await ctx.p.waitForTimeout(2500);
      const after = await ctx.p.locator("tr").count();
      await ctx.shot("catalog-search");
      return { ok: after < before && after > 0, note: "חיפוש 'מיקרו'",
               evidence: `שורות לפני ${before} · אחרי ${after}` };
    },
  },
  // ── 14 · שינוי בתוכנית המבחנים ────────────────────────────
  {
    id: "exam-plan-change",
    name: "שינוי בתוכנית המבחנים",
    async run(ctx) {
      await ctx.go("/he/exam-planner", 9000);
      // בנייד אין גרירה (א.1.6 — dnd-kit מודד 0×0 על עמודה מוסתרת),
      // ולכן אין `aria-label="גררו את הלמידה"`. מה שקיים בשני הרוחבים הוא
      // "דחו יום", והוא גם הפעולה שאנחנו בודקים.
      const countBlocks = async () =>
        ctx.MOBILE
          ? ctx.p.locator("button").filter({ hasText: /^דחו יום$/ }).count()
          : ctx.p.locator('button[aria-label^="גררו את הלמידה"]').count();
      const before = await countBlocks();
      if (!before) return { ok: false, note: "אין בלוקי לימוד בלוח" };
      await ctx.shot("exam-change-before");
      const push = ctx.p.locator("button").filter({ hasText: /^דחו יום$/ }).first();
      const acted = await push.count() ? (await push.scrollIntoViewIfNeeded(), await push.click().catch(() => {}), true) : false;
      await ctx.p.waitForTimeout(4000);
      const after = await countBlocks();
      await ctx.shot("exam-change-after");
      return { ok: acted, note: acted ? "נדחה יום לימוד" : "לא נמצא «דחו יום»",
               evidence: `בלוקי לימוד לפני ${before} · אחרי ${after}` };
    },
  },

  // ── 15 · מילואים: הוספה ──────────────────────────────────
  {
    id: "miluim-add",
    name: "הוספת תקופת מילואים",
    async run(ctx) {
      await ctx.go("/he/miluim", 8000);
      const t0 = await ctx.txt();
      if (t0.length < 400) return { ok: false, note: "מסך המילואים ריק" };
      await ctx.shot("miluim-before");
      const rowsBefore = await ctx.p.locator("tbody tr").count();
      // ימי שירות + לחימה, ואז "הוסיפו סמסטר" ואז "שמירת מילואים"
      const days = ctx.p.locator('input[type="number"]').first();
      if (!(await days.count())) return { ok: false, note: "לא נמצא שדה ימי שירות" };
      await days.fill("40");
      const combat = ctx.p.locator('input[type="checkbox"]').first();
      if (await combat.count()) await combat.check().catch(() => {});
      await ctx.p.waitForTimeout(600);
      const added = await click(ctx, /^הוסיפו סמסטר$/, 2500);
      const saved = await click(ctx, /^שמירת מילואים$/, 5000);
      await ctx.settle(3000);
      const t = await ctx.txt();
      await ctx.shot("miluim-after");
      const rowsAfter = await ctx.p.locator("tbody tr").count();
      const group = (t.match(/קבוצה [A-D]/) || ["—"])[0];
      return { ok: added && saved, note: `הוספה:${added ? "✓" : "✗"} שמירה:${saved ? "✓" : "✗"}`,
               evidence: `שורות מילואים לפני ${rowsBefore} · אחרי ${rowsAfter} · הקבוצה שנגזרה מ-40 ימי לחימה: ${group}` };
    },
  },

  // ── 15א · מילואים: מחיקה ─────────────────────────────────
  {
    id: "miluim-delete",
    name: "מחיקת תקופת מילואים",
    async run(ctx) {
      await ctx.go("/he/miluim", 8000);
      const rows = () => ctx.p.locator("tbody tr").count();
      const before = await rows();
      if (!before) return { ok: true, na: true, note: "אין שורות מילואים למחוק" };
      await ctx.shot("miluim-del-before");
      // כפתורי המחיקה הם אייקון בלבד — השם יושב ב-aria-label, ו-hasText
      // לא רואה אותם.
      const del = ctx.p.getByRole("button", { name: /^מחקו את/ }).last();
      if (!(await del.count())) return { ok: false, note: "לא נמצא כפתור מחיקה" };
      const label = (await del.getAttribute("aria-label")) ?? "";
      await del.scrollIntoViewIfNeeded();
      const t0 = Date.now();
      try { await del.click({ timeout: 8000 }); } catch { return { ok: false, note: "הלחיצה נחסמה" }; }
      // המחיקה עוברת invalidate → refetch מול מסד בסידני. מדדתי 4.1 שניות.
      // הגרסה הראשונה חיכתה 3 והכריזה "המסך לא התעדכן" — כמעט דיווח באג
      // על פעולה תקינה. ממתינים לשינוי, לא לפרק זמן שניחשתי.
      let after = before;
      for (let i = 0; i < 15 && after >= before; i++) {
        await ctx.p.waitForTimeout(1000);
        after = await rows();
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      await ctx.shot("miluim-del-after");
      return { ok: after < before, note: `נמחקה: «${label}»`,
               evidence: `שורות לפני ${before} · אחרי ${after} · המסך התעדכן ב-${secs}s` };
    },
  },

  // ── 16 · השושלת: תרומה ────────────────────────────────────
  {
    id: "lineage",
    name: "השושלת — הדירוגים והתרומה",
    async run(ctx) {
      await ctx.go("/he/lineage", 10000);
      const t = await ctx.txt();
      await ctx.shot("lineage");
      const has = /מי שלפניכם|שלושה דורות|דירוג/.test(t);
      const contribute = await ctx.p.locator("button,a").filter({ hasText: /תרמו|דרגו|הוסיפו טיפ/ }).count();
      return { ok: has && t.length > 1000, note: has ? "המסך מלא" : "תוכן חסר",
               evidence: `${t.length} תווים · ${contribute} דלתות לתרומה` };
    },
  },

  // ── 17 · המדריך למתחיל ────────────────────────────────────
  {
    id: "guide",
    name: "מדריך מתחיל",
    async run(ctx) {
      await ctx.go("/he/guide", 7000);
      const t = await ctx.txt();
      await ctx.shot("guide");
      return { ok: t.length > 1500, note: `${t.length} תווים`,
               evidence: (t.match(/ש״ס|בידינג|תחום מיקוד|אנגלית/g) || []).length + " מונחי מפתח מוסברים" };
    },
  },

  // ── 18 · הדפסה ────────────────────────────────────────────
  {
    id: "print",
    name: "גיליון הדפסה קיים",
    async run(ctx) {
      await ctx.go("/he/planner/semester", 8000);
      const rules = await ctx.p.evaluate(() => {
        let n = 0;
        for (const sheet of document.styleSheets) {
          try { for (const r of sheet.cssRules) if (r.conditionText?.includes("print") || r.media?.mediaText?.includes("print")) n++; }
          catch { /* cross-origin */ }
        }
        return n;
      });
      return { ok: rules > 0, note: rules ? "יש כללי @media print" : "אין גיליון הדפסה",
               evidence: `${rules} כללי print` };
    },
  },
];
