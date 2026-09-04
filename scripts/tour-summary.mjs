// סיכום סיור שלוש הפרסונות — המספרים שנכנסים לדוח, ישר מהראיות.
import { readFileSync, readdirSync } from "node:fs";
const files = readdirSync("docs").filter((f) => /^סיור-סופי-y\d-\d+\.json$/.test(f)).sort();
let S = 0, A = 0, I = 0, JS = 0, D = 0, H = 0;
const rows = [], issues = new Map();
for (const f of files) {
  const d = JSON.parse(readFileSync(`docs/${f}`, "utf-8"));
  const sc = Object.values(d.screens);
  const acts = sc.reduce((s, v) => s + (v.actions?.length ?? 0), 0);
  const iss = sc.reduce((s, v) => s + v.issues.length, 0);
  const js = sc.reduce((s, v) => s + (v.actions ?? []).filter((a) => a.js?.length).length, 0);
  const dis = sc.reduce((s, v) => s + (v.actions ?? []).filter((a) => a.why === "מושבת כצפוי").length, 0);
  const hid = sc.reduce((s, v) => s + (v.actions ?? []).filter((a) => a.why === "מוסתר במצב הזה").length, 0);
  S += sc.length; A += acts; I += iss; JS += js; D += dis; H += hid;
  rows.push(`${d.persona}·${String(d.width).padStart(4)}px  ${String(sc.length).padStart(2)} מסכים · ${String(acts).padStart(3)} פעולות · ${iss} ממצאים`);
  for (const v of sc) for (const x of v.issues) {
    const k = x.replace(/\s+/g, " ").replace(/^אחרי "[^"]*": /, "").slice(0, 60);
    issues.set(k, (issues.get(k) ?? 0) + 1);
  }
}
console.log(rows.join("\n"));
console.log(`\nסה״כ: ${S} מסכים · ${A} פעולות · ${I} ממצאים · ${JS} שגיאות JS`);
console.log(`מתוך הפעולות: ${D} כפתורים מושבתים כצפוי · ${H} מוסתרים במצב הזה`);
console.log("\nממצאים לפי סוג:");
for (const [k, n] of [...issues].sort((a, b) => b[1] - a[1])) console.log(`  ×${n}  ${k}`);
