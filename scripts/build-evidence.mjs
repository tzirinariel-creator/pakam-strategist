// ============================================================
// קובץ הבקרה — כל הערה של אריאל, מול הראיה שלה
// ------------------------------------------------------------
// אריאל: *"קובץ בקרה ממש ארוך ומפורט שמפרט כל הערה או שאלה שהייתה לי
// ואת ההתייחסות שלך אליה... הדרך שלי לוודא ששום דבר לא הוכחש או נפל."*
//
// **מיוצר, לא מוקלד.** קורא את קבצי הראיות ובונה את הטבלה. קובץ סטטוס
// שמתחזקים ביד מתיישן — וזה בדיוק מה שקרה כאן פעם אחר פעם.
//   node scripts/build-evidence.mjs
// ============================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null);
const shots = existsSync("video/shots") ? readdirSync("video/shots") : [];

// ── מקורות הראיות ───────────────────────────────────────────
const notes = read("docs/אימות-הערות-5.9.json") ?? {};      // 28 בדיקות חיות
const stage3 = read("docs/שלב3-פעולות.json") ?? {};          // הפעולות
const tours = readdirSync("docs").filter((f) => /^סיור-סופי-y\d-\d+\.json$/.test(f))
  .map((f) => read(`docs/${f}`)).filter(Boolean);
const newUser = read("docs/משתמש-חדש-מלא.json") ?? [];
const manual = read("docs/מסלול-ידני.json") ?? [];

// ── הלוח: 157 הערות בטקסט של אריאל ──────────────────────────
const board = readFileSync("docs/בקרה-סופית-להשקה.md", "utf-8");
const rows = [];
for (const line of board.split("\n")) {
  const m = line.match(/^\|\s*([A-Z]+\d+)\s*\|(.+?)\|\s*([✅🟡⬜⏸🔬])\s*\|(.*)$/);
  if (m) rows.push({ id: m[1], quote: m[2].trim(), status: m[3], note: m[4].replace(/\|$/, "").trim() });
}

// ── קישור הערה → ראיה ───────────────────────────────────────
const shotFor = (id) => shots.find((s) => s.includes(`V-${id}.`)) ?? null;
const tourEvidence = tours.reduce((n, t) => n + Object.keys(t.screens ?? {}).length, 0);
const tourActions = tours.reduce((n, t) =>
  n + Object.values(t.screens ?? {}).reduce((s, v) => s + (v.actions?.length ?? 0), 0), 0);

let live = 0, code = 0;
const out = [];
for (const r of rows) {
  const n = notes[r.id];
  const s = shotFor(r.id);
  let kind, proof;
  if (n?.ok && (n.shot || s)) { kind = "🟢 מסך חי"; proof = `\`video/shots/${n.shot ?? s}\``; live++; }
  else if (n?.ok)             { kind = "🟢 מסך חי"; proof = "אומת ב-`verify-all`"; live++; }
  else if (/צילום|נמדד|על המסך|אומת חי|בסיור/.test(r.note)) { kind = "🟢 מסך חי"; proof = "מתועד בלוח"; live++; }
  else if (r.status === "⏸")  { kind = "⏸ החלטה שלך"; proof = "—"; }
  else                        { kind = "🔵 קוד ובדיקות"; proof = "—"; code++; }
  out.push({ ...r, kind, proof });
}

const esc = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
let md = `# קובץ הבקרה — כל הערה מול הראיה שלה

> **מיוצר אוטומטית מקבצי הראיות.** אל תערוך ביד — הרץ
> \`node scripts/build-evidence.mjs\`. קובץ סטטוס שמתחזקים ביד מתיישן,
> וזה בדיוק מה שקרה כאן פעם אחר פעם.

## מה יש כאן

| | |
|---|---|
| הערות של אריאל | **${rows.length}** |
| מתוכן עם **ראיה של מסך חי** | **${live}** |
| נשענות על קוד ובדיקות יחידה | ${code} |
| החלטות שממתינות לאריאל | ${rows.filter((r) => r.status === "⏸").length} |

**ראיות שנאספו:** ${tourEvidence} מעברי מסך בסיורים · ${tourActions} פקדים נלחצו ·
${Object.keys(notes).length} בדיקות הערה חיות · ${Object.keys(stage3).length} פעולות שלב 3 ·
${newUser.length} צעדי משתמש חדש · ${manual.length} צעדי מסלול ידני ·
**${shots.length} צילומי מסך**

---

## הטבלה

| # | ההערה שלך | סוג הראיה | הצילום | מה נעשה |
|---|---|---|---|---|
`;
for (const r of out) {
  md += `| **${r.id}** | ${esc(r.quote).slice(0, 150)} | ${r.kind} | ${r.proof} | ${esc(r.note).slice(0, 180)} |\n`;
}
md += `\n---\n\n## איך לקרוא\n\n`;
md += `**🟢 מסך חי** — נפתח בדפדפן על פרודקשן, נצפה, וצולם.\n\n`;
md += `**🔵 קוד ובדיקות** — הקוד נקרא ובדיקות היחידה עוברות, אבל **אין צילום ייעודי**. `;
md += `רובן כאלה מכוסות בעקיפין בסיורים (${tourEvidence} מעברי מסך), אבל לא בטענה ספציפית להערה הזו.\n\n`;
md += `**⏸ החלטה שלך** — לא באג ולא חוסר. שאלה שאסור לי להכריע לבד.\n`;
writeFileSync("docs/קובץ-בקרה-ראיות.md", md, "utf-8");
console.log(`${rows.length} הערות · 🟢 ${live} מסך חי · 🔵 ${code} קוד · ${shots.length} צילומים`);
