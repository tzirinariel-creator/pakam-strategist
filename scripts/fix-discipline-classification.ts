#!/usr/bin/env npx tsx
// =========================================================================
// Repair the תשפ״ז discipline classification.
// =========================================================================
// WHY THIS EXISTS
//
// The תשפ״ז catalog was classified by YEDION SECTION HEADER. 145 of 302
// courses (48%) came out `GENERAL`, which counts toward NO discipline and NO
// focus area — so the "60 ש״ס בתחום המיקוד" meter is wrong for every real
// student, and a seminar in your own focus discipline earns you zero focus
// credit.
//
// Two distinct causes, with very different confidence:
//
//  A. A SPELLING VARIANT. The yedion prints both "קורסי בחירה בפילוסופיה" and
//     "קורסי בחירה בפילסופיה" (missing the ו), plus "קורסי בחירה החוג
//     לפילסופיה". The matcher knew only the first. 15 philosophy courses fell
//     to GENERAL over one letter. This is not a judgement call — it is the
//     same word — so it is applied by default.
//
//  B. SECTIONS THAT NAME NO DISCIPLINE, chiefly the seminars: 66 of 68 sit
//     under "סמינר 4 ש\"ס" / "סמינר 3 ש\"ס" / "סמינר בתחום המיקוד בו תוגש
//     עבודה סמינריונית". That last header says outright that a seminar belongs
//     to a focus area, so GENERAL is definitively wrong — but the header does
//     not say WHICH. The course CODE does: at TAU the 4-digit prefix is the
//     department, and among rows the header DID classify the mapping is
//     essentially pure (0618→PHILOSOPHY 41/41, 1031→POLITICAL_SCIENCE 37/37,
//     1011→ECONOMICS 23/23, 1411→LAW 30/31, 0651→PPE_CORE 11/11).
//     Inferring from the prefix is well-evidenced, but it is an academic
//     classification affecting 24 real students' focus-area counts, so it is
//     OPT-IN behind --prefix and reported in full before it writes.
//
// USAGE
//   npx tsx scripts/fix-discipline-classification.ts              # dry run
//   npx tsx scripts/fix-discipline-classification.ts --apply      # spelling only
//   npx tsx scripts/fix-discipline-classification.ts --apply --prefix
//
// Writes are UPDATE-only on Course.discipline. Nothing is created or deleted.
// =========================================================================
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const PREFIX = process.argv.includes("--prefix");

const ROOT = path.join(__dirname, "..");
for (const envFile of [".env.local", ".env"]) {
  const p = path.join(ROOT, envFile);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
  break;
}

type Row = { code: string; name: string; discipline: string; section?: string };
const JSON_PATH = path.join(ROOT, "scripts/yedion_classified.json");
const rows = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8")) as Row[];

// ── A. the spelling variant ──────────────────────────────────────────────
// Normalise away the optional ו and re-test the philosophy section names.
const isPhilosophySection = (s: string) =>
  /קורסי\s+(בחירה|חובה|יסוד|קריאה)/.test(s) && /פיל(ו)?סופיה/.test(s);

// ── B. department prefix → discipline, learned from the rows the header DID
//       classify. Requires ≥3 classified rows and ≥80% agreement, so a prefix
//       with one lone sample never drives a bulk re-file. ──────────────────
function learnPrefixMap(): Map<string, string> {
  const seen = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.discipline === "GENERAL") continue;
    const pre = (r.code ?? "").slice(0, 4);
    if (!pre) continue;
    const m = seen.get(pre) ?? new Map<string, number>();
    m.set(r.discipline, (m.get(r.discipline) ?? 0) + 1);
    seen.set(pre, m);
  }
  const out = new Map<string, string>();
  for (const [pre, counts] of seen) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (total >= 3 && n / total >= 0.8) out.set(pre, best);
  }
  return out;
}

const prefixMap = learnPrefixMap();

interface Change { code: string; name: string; from: string; to: string; why: string }
const changes: Change[] = [];

for (const r of rows) {
  if (r.discipline !== "GENERAL") continue;
  const section = r.section ?? "";
  if (isPhilosophySection(section)) {
    changes.push({ code: r.code, name: r.name, from: "GENERAL", to: "PHILOSOPHY", why: "spelling" });
    continue;
  }
  if (PREFIX) {
    const inferred = prefixMap.get((r.code ?? "").slice(0, 4));
    if (inferred) {
      changes.push({ code: r.code, name: r.name, from: "GENERAL", to: inferred, why: `prefix ${r.code.slice(0, 4)}` });
    }
  }
}

function report() {
  const byWhy = new Map<string, Change[]>();
  for (const c of changes) {
    const k = c.why === "spelling" ? "spelling" : "prefix";
    byWhy.set(k, [...(byWhy.get(k) ?? []), c]);
  }
  console.log(`\nGENERAL before: ${rows.filter((r) => r.discipline === "GENERAL").length} / ${rows.length}`);
  for (const [k, list] of byWhy) {
    console.log(`\n── ${k}: ${list.length} courses ──`);
    const byTo = new Map<string, number>();
    for (const c of list) byTo.set(c.to, (byTo.get(c.to) ?? 0) + 1);
    for (const [to, n] of [...byTo].sort((a, b) => b[1] - a[1])) console.log(`   → ${to}: ${n}`);
    for (const c of list.slice(0, 8)) console.log(`     ${c.code}  ${c.name.slice(0, 46)}  → ${c.to}`);
    if (list.length > 8) console.log(`     … +${list.length - 8} more`);
  }
  console.log(`\nGENERAL after:  ${rows.filter((r) => r.discipline === "GENERAL").length - changes.length} / ${rows.length}`);
  console.log(APPLY ? "\nAPPLYING…\n" : "\nDRY RUN — nothing written. Re-run with --apply.\n");
}

async function main() {
  report();
  if (!APPLY) return;

  // Update the JSON first so any future migration starts from the truth.
  const byCode = new Map(changes.map((c) => [c.code, c.to]));
  for (const r of rows) {
    const to = byCode.get(r.code);
    if (to) r.discipline = to;
  }
  fs.writeFileSync(JSON_PATH, JSON.stringify(rows, null, 2) + "\n", "utf-8");
  console.log(`✅ ${JSON_PATH} updated.`);

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    let written = 0;
    let skipped = 0;
    for (const c of changes) {
      // Only ever move a row that is STILL GENERAL — never overwrite a
      // discipline someone has since corrected by hand.
      const res = await prisma.course.updateMany({
        where: { code: c.code, discipline: "GENERAL" },
        data: { discipline: c.to as never },
      });
      if (res.count > 0) written += res.count;
      else skipped += 1;
    }
    console.log(`✅ DB: ${written} courses re-filed, ${skipped} skipped (absent or already non-GENERAL).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
