#!/usr/bin/env node
// ספירת הלוח — נגזרת מהטבלאות, אף פעם לא מהזיכרון.
// אריאל, 4.9: "זאת הדרך שלי לוודא ששום דבר לא הוכחש או נפל בין הכיסאות."
// הכותרת של הלוח כבר הייתה לא מסונכרנת פעם אחת (אמרה 154 כשהיו 157).
import { readFileSync } from "node:fs";
const FILE = "docs/בקרה-סופית-להשקה.md";
const SYMS = ["✅", "🟡", "🔬", "⬜", "⏸", "❓"];
// שורות W נושאות חומרה בעמודה 4 והסטטוס בעמודה 5.
const SEVERITY = { high: null, medium: null, low: null };
const counts = Object.fromEntries(SYMS.map((s) => [s, 0]));
let total = 0;
const unknown = [];
for (const line of readFileSync(FILE, "utf-8").split("\n")) {
  const m = /^\| ([A-Z]+\d+) \|/.exec(line);
  if (!m) continue;
  total += 1;
  const cols = line.split("|").map((c) => c.trim());
  let status = cols[3] ?? "";
  if (Object.hasOwn(SEVERITY, status)) status = cols[4] ?? "";
  const sym = SYMS.find((s) => status.startsWith(s));
  if (sym) counts[sym] += 1;
  else unknown.push(`${m[1]} → «${status.slice(0, 30)}»`);
}
const green = counts["✅"];
console.log(`${total} פריטים · ${green} ירוקים · ${total - green} פתוחים`);
for (const s of SYMS) if (counts[s]) console.log(`   ${s} ${counts[s]}`);
if (unknown.length) { console.log("\n⚠️ שורות בלי סטטוס מזוהה:"); unknown.forEach((u) => console.log("   " + u)); }
process.exit(unknown.length ? 1 : 0);
