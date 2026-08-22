#!/usr/bin/env npx tsx
// =========================================================================
// Correcting the stored semester from the ידיעון, where the evidence is strong
// =========================================================================
// Ariel, 22.8: "אני כמעט בטוח שמיקרו ב חובה בשנה ב סמסטר א... מה כתוב בידיעון?"
//
// He was right. `audit-semesters-vs-yedion.ts` found 12 courses whose stored
// semester contradicts the ידיעון's own timetable rows, two of them a straight
// inversion of a mandatory course:
//
//   מיקרו א׳ (1011-2103)   stored א׳   ·   ידיעון ב׳   (6 rows, unanimous)
//   מיקרו ב׳ (1011-2109)   stored ב׳   ·   ידיעון א׳   (7 rows, unanimous)
//
// With the year included that is the natural back-to-back sequence — מיקרו א׳
// in year 1 spring, מיקרו ב׳ in year 2 autumn — which is exactly what Ariel
// said from memory, and what the planner was contradicting.
//
// WHAT THIS DOES NOT TOUCH, and why. Three kinds of disagreement are not the
// same size of claim:
//
//   · INVERSION  — stored says one term, the ידיעון says the other. They
//     cannot both be true and the ידיעון is the source. Corrected.
//   · WIDENING   — the ידיעון lists MORE terms than we store. Adding a term
//     can only give a student back an option the university really offers.
//     Corrected.
//   · NARROWING  — we store both terms, the ידיעון lists rows in only one.
//     This REMOVES an option, so it needs the evidence to be strong: at least
//     four session rows, all in one term. Below that the silence is more
//     likely a gap in the file than a fact about the course, and the course is
//     left alone and reported for Ariel.
//
// Existing student plans are NOT rewritten. That is deliberate and it is what
// `plan-placement.ts` exists for: the planner notices a row now sitting in a
// term its course is not given in, and OFFERS the move. Where a course sits is
// the student's decision.
//
// Takes a backup of the affected rows first.
//
//   npx tsx scripts/fix-semesters-from-yedion.ts          # dry run
//   npx tsx scripts/fix-semesters-from-yedion.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(__dirname, "..", envFile);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
  break;
}
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const APPLY = process.argv.includes("--apply");
const TERM: Record<string, string> = { "א": "FALL", "ב": "SPRING", "ק": "SUMMER" };
const he = (t: string) => (t === "FALL" ? "א׳" : t === "SPRING" ? "ב׳" : t === "SUMMER" ? "קיץ" : t);
const norm = (code: string) => String(code).replace(/-/g, "");
const heRows = (n: number) => (n === 1 ? "שורה אחת" : `${n} שורות`);

/**
 * How many ידיעון rows it takes to REMOVE a term we already offer.
 *
 * The threshold guards the removal, not the label. A one-row "inversion" is
 * still a removal: we drop the term we hold on the strength of a single
 * session line, and a single line is far more likely to be a gap in the file
 * than proof the course moved. Anything that only ADDS a term is unguarded —
 * it can restore an option, never take one away.
 */
const REMOVE_MIN_ROWS = 4;

type Kind = "inversion" | "widening" | "narrowing";

async function main() {
  const raw: { code: string; semester: string }[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "yedion_schedule.json"), "utf-8"),
  );

  const terms = new Map<string, Set<string>>();
  const rowCount = new Map<string, number>();
  for (const r of raw) {
    const t = TERM[r.semester];
    if (!t) continue;
    const k = norm(r.code);
    if (!terms.has(k)) terms.set(k, new Set());
    terms.get(k)!.add(t);
    rowCount.set(k, (rowCount.get(k) ?? 0) + 1);
  }

  const courses = await prisma.course.findMany({
    select: { id: true, code: true, nameHe: true, courseType: true, isMandatory: true, semesterOffered: true },
    orderBy: { code: "asc" },
  });

  const planned: {
    id: string; code: string; name: string; mandatory: boolean;
    from: string[]; to: string[]; kind: Kind; rows: number;
  }[] = [];
  const held: string[] = [];

  for (const c of courses) {
    const src = terms.get(norm(c.code));
    if (!src || src.size === 0) continue;

    const stored = new Set([...c.semesterOffered].map(String));
    const source = src;
    const same =
      stored.size === source.size && [...stored].every((t) => source.has(t));
    if (same) continue;

    const adds = [...source].filter((t) => !stored.has(t));
    const drops = [...stored].filter((t) => !source.has(t));
    const rows = rowCount.get(norm(c.code)) ?? 0;

    const kind: Kind =
      adds.length > 0 && drops.length > 0 ? "inversion" : adds.length > 0 ? "widening" : "narrowing";

    if (drops.length > 0 && rows < REMOVE_MIN_ROWS) {
      held.push(
        `  ${c.code}  ${c.nameHe}\n` +
          `        במסד ${[...stored].map(he).join("+")} · בידיעון ${[...source].map(he).join("+")} · ` +
          `רק ${heRows(rows)} בידיעון — לא מספיק כדי להוריד סמסטר`,
      );
      continue;
    }

    planned.push({
      id: c.id,
      code: c.code,
      name: c.nameHe,
      mandatory: c.courseType === "MANDATORY" || c.isMandatory === true,
      from: [...stored].sort(),
      to: [...source].sort(),
      kind,
      rows,
    });
  }

  planned.sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.code.localeCompare(b.code));

  const KIND_HE: Record<Kind, string> = {
    inversion: "היפוך",
    widening: "הרחבה",
    narrowing: "צמצום",
  };

  console.log(`${APPLY ? "מתקן" : "הרצה יבשה —"} ${planned.length} קורסים:\n`);
  for (const p of planned) {
    console.log(
      `  ${p.mandatory ? "חובה " : "בחירה"}  ${p.code}  ${p.name}`,
    );
    console.log(
      `          ${KIND_HE[p.kind]}: ${p.from.map(he).join("+") || "—"} → ${p.to.map(he).join("+")}   (${p.rows} שורות בידיעון)`,
    );
  }

  if (held.length > 0) {
    console.log(`\nלא נגעתי — ראיות חלשות מדי (${held.length}). לאריאל להכריע:`);
    held.forEach((h) => console.log(h));
  }

  if (!APPLY) {
    console.log("\n(הרצה יבשה. להחלה: --apply)");
    await prisma.$disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(__dirname, "..", "backups", `semesters-before-${stamp}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    JSON.stringify(planned.map((p) => ({ code: p.code, semesterOffered: p.from })), null, 2),
    "utf-8",
  );
  console.log(`\nגיבוי: ${path.relative(process.cwd(), backupPath)}`);

  for (const p of planned) {
    await prisma.course.update({
      where: { id: p.id },
      data: { semesterOffered: p.to as never },
    });
  }
  console.log(`עודכנו ${planned.length} קורסים.`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
