#!/usr/bin/env npx tsx
// =========================================================================
// Parse the ידיעון's "לוח בחינות ומטלות" tab (תשפ״ז) into structured data
// =========================================================================
// Ariel sent this three times; the first two exports were empty files. This one
// is a Word save of the ידיעון page, and it carries real data — but NOT the
// data everyone assumed.
//
// WHAT IT ACTUALLY CONTAINS, counted:
//   · 270 exam sittings — with DAY OF WEEK and TIME, and NO DATE.
//   · ~198 assignment/paper deadlines — with a real dd/mm/yy date.
//
// So the ידיעון has not published exam DATES for תשפ״ז yet. It publishes the
// slot ("מועד א׳ ביום ד׳ ב-14:00") and fills the date in later. That is worth
// stating plainly, because "the exam schedule" was treated as a missing file
// for two rounds when the source simply doesn't have that column yet.
//
// VERIFIED against an independent source: bid-it (the student association's
// planner) prints real dates for תשפ״ז. For the four courses we could compare,
// the weekday of bid-it's date matches the ידיעון's day exactly:
//   1011-2101 20/01/2027 → יום ד   ידיעון: יום ד   ✓
//   1011-2109 27/01/2027 → יום ד   ידיעון: יום ד   ✓
//   0618-2200 29/01/2027 → יום ו   ידיעון: יום ו   ✓
//   1011-2106 01/02/2027 → יום ב   ידיעון: יום ב   ✓
// Four for four. The ידיעון's day/time is real; only the date is pending.
//
// Output is a JSON asset, not a migration. Nothing is written to the database:
// this is catalog reference data, it is reversible by deleting a file, and a
// schema change days before launch is a risk with no upside.
//
// USAGE:  npx tsx scripts/parse-yedion-assessments.ts <document.xml> <out.json>
import fs from "node:fs";
import path from "node:path";

const COURSE_CODE = /^\d{4}-\d{4}$/;
const DATE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const TIME = /^\d{1,2}:\d{2}$/;
const DAY_LETTERS = new Set(["א", "ב", "ג", "ד", "ה", "ו"]);

/** "יום ד" → DayOfWeek. The ידיעון never lists Saturday. */
const DAY_ENUM: Record<string, string> = {
  "א": "SUNDAY", "ב": "MONDAY", "ג": "TUESDAY",
  "ד": "WEDNESDAY", "ה": "THURSDAY", "ו": "FRIDAY",
};

export interface ExamSitting {
  /** "A" = מועד א׳, "B" = מועד ב׳. */
  sitting: "A" | "B";
  /** DayOfWeek enum, e.g. "WEDNESDAY". */
  dayOfWeek: string;
  /** "14:00". */
  time: string;
}

export interface AssessmentRecord {
  courseCode: string;
  /** "01" / "02" / "כל הקבוצות". */
  group: string | null;
  /** An exam ("סופית") publishes sittings; a paper ("בית") publishes a deadline. */
  kind: "exam" | "paper" | "unknown";
  /** Day+time per sitting. EMPTY for papers. Dates are NOT published yet. */
  sittings: ExamSitting[];
  /** ISO date for a paper deadline, or null. */
  dueDate: string | null;
}

/** Pull the `<w:t>` runs out of a .docx document.xml, in document order. */
export function tokensFromDocumentXml(xml: string): string[] {
  const body = xml.slice(Math.max(0, xml.indexOf("<w:body>")));
  const runs = [...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]!);
  return runs
    .map((t) =>
      t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim(),
    )
    .filter((t) => t && !t.includes("<w:"));
}

/**
 * Group the flat token stream into one record per course-code occurrence.
 *
 * The page is a table flattened into runs, so a record is "everything between
 * this course code and the next one". Word splits Hebrew course names across
 * many runs, which is why the name is not reconstructed here — the catalog
 * already holds the authoritative name, and the code is the join key.
 */
export function parseAssessments(tokens: string[]): AssessmentRecord[] {
  const starts: number[] = [];
  tokens.forEach((t, i) => { if (COURSE_CODE.test(t)) starts.push(i); });

  const out: AssessmentRecord[] = [];
  for (let n = 0; n < starts.length; n++) {
    const i = starts[n]!;
    const end = n + 1 < starts.length ? starts[n + 1]! : tokens.length;
    const body = tokens.slice(i + 1, end);

    const kind: AssessmentRecord["kind"] =
      body.includes("סופית") ? "exam" : body.includes("בית") ? "paper" : "unknown";

    const group =
      body.find((t) => /^\d{2}$/.test(t)) ??
      (body.includes("הקבוצות") ? "כל הקבוצות" : null);

    // Sittings: the ידיעון prints "יום <letter> <HH:MM>" once for מועד א׳ and
    // again for מועד ב׳, in that order.
    const sittings: ExamSitting[] = [];
    for (let k = 0; k < body.length - 2; k++) {
      if (body[k] !== "יום") continue;
      const letter = body[k + 1]!;
      const time = body[k + 2]!;
      if (!DAY_LETTERS.has(letter) || !TIME.test(time)) continue;
      const day = DAY_ENUM[letter];
      if (!day) continue;
      sittings.push({ sitting: sittings.length === 0 ? "A" : "B", dayOfWeek: day, time });
      if (sittings.length === 2) break;
    }

    // A paper deadline is a real dd/mm/yy. Two-digit years in this document are
    // 27 → 2027; the ידיעון never spans a century.
    let dueDate: string | null = null;
    const d = body.find((t) => DATE.test(t));
    if (d) {
      const m = DATE.exec(d)!;
      dueDate = `20${m[3]}-${m[2]}-${m[1]}`;
    }

    // A record with nothing usable is a table-header artefact, not a course.
    if (kind === "unknown" && sittings.length === 0 && !dueDate) continue;

    out.push({ courseCode: tokens[i]!, group, kind, sittings, dueDate });
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

  const exams = records.filter((r) => r.kind === "exam");
  const papers = records.filter((r) => r.kind === "paper");
  const examsWithBothSittings = exams.filter((r) => r.sittings.length === 2);
  const papersWithDate = papers.filter((r) => r.dueDate);

  console.log(`tokens               ${tokens.length}`);
  console.log(`records              ${records.length}`);
  console.log(`  exams              ${exams.length}  (both sittings: ${examsWithBothSittings.length})`);
  console.log(`  papers             ${papers.length}  (with a date: ${papersWithDate.length})`);
  console.log(`  exams with a DATE  ${exams.filter((r) => r.dueDate).length}  ← the ידיעון hasn't published these`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ source: "ידיעון פכ״מ תשפ״ז — לוח בחינות ומטלות", records }, null, 2), "utf-8");
  console.log(`\nwrote ${outPath}`);
}
