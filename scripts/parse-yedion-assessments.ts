#!/usr/bin/env npx tsx
// =========================================================================
// Parse the ידיעון's "לוח בחינות ומטלות" (תשפ״ז) into structured data
// =========================================================================
// Source: https://www.tau.ac.il/study-program?safa=1&shana=2026&tab=assignments&tcid=5904
// saved to .docx and exported. One row per course/group, shaped:
//
//   0618-1018 · מבוא לפילוסופיה של המוסר · א · 01 · בחינה סופית
//     מועד א׳  28/01/2027 יום ה 09:00
//     מועד ב׳  05/03/2027 יום ו 09:00
//
// ── A CORRECTION, and it matters ─────────────────────────────────────────
// My first version of this parser reported "the ידיעון publishes no exam
// DATES, only day and time". That was WRONG, and it was my bug, not the
// source's. The run-extraction regex was `<w:t[^>]*>` — which also matches
// `<w:tbl>`, `<w:tc>` and `<w:tcPr>`, since every one of them starts with
// `<w:t`. The non-greedy body then swallowed whole spans of paragraph
// properties, and all 701 exam dates disappeared inside them.
//
// The fix is one character class: `<w:t(?:\s[^>]*)?>` requires whitespace or
// the closing bracket immediately after `w:t`, so a table tag can never match.
// Ariel caught it by looking at the actual page and asking "למה? תסתכל
// המבנה.. יש תאריך" — he was right and the data was there the whole time.
//
// Output is a JSON asset read at runtime, NOT a migration: catalog reference
// data, reversible by deleting a file, and no schema change days before launch.
//
// USAGE:  npx tsx scripts/parse-yedion-assessments.ts <document.xml> <out.json>
import fs from "node:fs";
import path from "node:path";

const COURSE_CODE = /^\d{4}-\d{4}$/;
/** The ידיעון prints dd/mm/yyyy for exams and dd/mm/yy for some deadlines. */
const DATE = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
const TIME = /^\d{1,2}:\d{2}$/;

const DAY_ENUM: Record<string, string> = {
  "א": "SUNDAY", "ב": "MONDAY", "ג": "TUESDAY",
  "ד": "WEDNESDAY", "ה": "THURSDAY", "ו": "FRIDAY", "ש": "SATURDAY",
};

export interface YedionSitting {
  /** "A" = מועד א׳, "B" = מועד ב׳. */
  sitting: "A" | "B";
  /** ISO date, e.g. "2027-01-28". */
  date: string;
  /** DayOfWeek enum, as printed alongside the date. */
  dayOfWeek: string | null;
  /** "09:00". */
  time: string | null;
}

export interface AssessmentRecord {
  courseCode: string;
  courseName: string;
  /** The ידיעון's semester letter: "א" / "ב" / "קיץ". */
  semester: string | null;
  /** "01" / "02" / "כל הקבוצות". */
  group: string | null;
  /** "בחינה סופית", "עבודת בית", … as the ידיעון labels it. */
  assessmentType: string | null;
  /** Exam sittings with real dates. Empty for a paper. */
  sittings: YedionSitting[];
  /** ISO deadline for a paper/assignment, or null. */
  dueDate: string | null;
}

/**
 * Pull `<w:t>` run text out of a .docx document.xml, in document order.
 *
 * The `(?:\s[^>]*)?` is load-bearing — see the correction note above. Without
 * it this also matches `<w:tbl>`/`<w:tc>`/`<w:tcPr>` and silently eats content.
 */
export function tokensFromDocumentXml(xml: string): string[] {
  const at = xml.indexOf("<w:body>");
  const body = xml.slice(at >= 0 ? at : 0);
  const runs = [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]!);
  return runs
    .map((t) =>
      t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim(),
    )
    .filter(Boolean);
}

/** "28/01/2027" → "2027-01-28". Two-digit years are 20xx; the ידיעון spans no century. */
function toIso(token: string): string | null {
  const m = DATE.exec(token);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy!.length === 4 ? yy! : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

/**
 * Group the flat run stream into one record per course-code occurrence and
 * read the fields positionally: everything between this course code and the
 * next one belongs to this row.
 */
export function parseAssessments(tokens: string[]): AssessmentRecord[] {
  const starts: number[] = [];
  tokens.forEach((t, i) => { if (COURSE_CODE.test(t)) starts.push(i); });

  const out: AssessmentRecord[] = [];
  for (let n = 0; n < starts.length; n++) {
    const i = starts[n]!;
    const end = n + 1 < starts.length ? starts[n + 1]! : tokens.length;
    const body = tokens.slice(i + 1, end);

    // Name = the words before the first structural marker (semester letter,
    // group number, or assessment label). Word splits Hebrew across runs, so
    // it is rejoined here.
    const nameParts: string[] = [];
    for (const t of body) {
      if (/^(א|ב|קיץ)$/.test(t) || /^\d{2}$/.test(t) || t === "כל" ||
          t.startsWith("בחינה") || t.startsWith("עבודת") || t.startsWith("תאריך")) break;
      nameParts.push(t);
    }
    const courseName = nameParts.join(" ").replace(/\s+([,'"])/g, "$1").trim();

    const semester = body.find((t) => /^(א|ב|קיץ)$/.test(t)) ?? null;
    const group =
      body.find((t) => /^\d{2}$/.test(t)) ?? (body.includes("הקבוצות") ? "כל הקבוצות" : null);

    const typeIdx = body.findIndex((t) => t === "בחינה" || t === "עבודת" || t === "תאריך");
    const assessmentType =
      typeIdx >= 0 ? [body[typeIdx], body[typeIdx + 1]].filter(Boolean).join(" ") : null;

    // Every date in the row, with the day/time that follow it.
    const sittings: YedionSitting[] = [];
    let dueDate: string | null = null;
    for (let k = 0; k < body.length; k++) {
      const iso = toIso(body[k]!);
      if (!iso) continue;
      const dayLetter = body[k + 1] === "יום" ? body[k + 2] : undefined;
      const time = body.slice(k + 1, k + 4).find((t) => TIME.test(t)) ?? null;
      const isExam = assessmentType?.startsWith("בחינה") ?? false;
      if (isExam) {
        sittings.push({
          sitting: sittings.length === 0 ? "A" : "B",
          date: iso,
          dayOfWeek: dayLetter ? (DAY_ENUM[dayLetter] ?? null) : null,
          time,
        });
        if (sittings.length === 2) break;
      } else if (!dueDate) {
        dueDate = iso;
      }
    }

    if (!courseName && sittings.length === 0 && !dueDate) continue; // header artefact

    out.push({
      courseCode: tokens[i]!, courseName, semester, group, assessmentType, sittings, dueDate,
    });
  }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const [, , xmlPath, outPath] = process.argv;
  if (!xmlPath || !outPath) {
    console.error("usage: parse-yedion-assessments.ts <document.xml> <out.json>");
    process.exit(1);
  }
  const tokens = tokensFromDocumentXml(fs.readFileSync(xmlPath, "utf-8"));
  const records = parseAssessments(tokens);
  const exams = records.filter((r) => r.sittings.length > 0);
  const papers = records.filter((r) => r.dueDate);

  console.log(`tokens                    ${tokens.length}`);
  console.log(`records                   ${records.length}`);
  console.log(`  with exam sittings      ${exams.length}`);
  console.log(`    both מועד א׳ and ב׳    ${exams.filter((r) => r.sittings.length === 2).length}`);
  console.log(`    sittings carrying a DATE ${exams.flatMap((r) => r.sittings).filter((s) => s.date).length}`);
  console.log(`  with a paper deadline   ${papers.length}`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      source: "ידיעון פכ״מ תשפ״ז — לוח בחינות ומטלות",
      sourceUrl: "https://www.tau.ac.il/study-program?safa=1&shana=2026&tab=assignments&tcid=5904",
      records,
    }, null, 2),
    "utf-8",
  );
  console.log(`\nwrote ${outPath}`);
}
