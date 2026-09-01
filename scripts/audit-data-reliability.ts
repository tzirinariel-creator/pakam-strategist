#!/usr/bin/env npx tsx
// =========================================================================
// בדיקת מהימנות מלאה — כל קורס, כל שעה, כל מבחן
// =========================================================================
// Ariel, 1.9: "מתי פעם אחרונה עשית לעצמך בדיקת מהימנות של כל הקורסים, כל
// השעות, כל המבחנים, הכול הכול הכול כדי לוודא שאנחנו לא מפילים בפח אף
// סטודנט?" · "הבסיס של האפליקציה — מהימנות הנתונים… זה החלק הכי קריטי
// שבונה אמון."
//
// The honest answer to his question was: never, not like this. There are
// audits for single questions — mandatory coverage, semesters against the
// ידיעון, the facts on the tips page — and each was written the day a
// specific bug was found. This is the one that runs over everything at once,
// so the next bug of that kind is found by us and not by a student in the
// middle of a bidding round.
//
// It is READ-ONLY and it changes nothing. Every check below is phrased as a
// question a student would be entitled to ask, and each one names the rows
// that fail so they can be looked at rather than merely counted.
//
//   npx tsx scripts/audit-data-reliability.ts
//   npx tsx scripts/audit-data-reliability.ts --verbose   # list every row

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

const VERBOSE = process.argv.includes("--verbose");
const MAX_LISTED = VERBOSE ? 500 : 6;

interface Check {
  id: string;
  question: string;
  /** Rows that FAIL — each one a thing a student could be misled by. */
  offenders: string[];
  /** True when a failure here would actively mislead, not merely look untidy. */
  harmful: boolean;
}

const checks: Check[] = [];
const add = (id: string, question: string, offenders: string[], harmful = true) =>
  checks.push({ id, question, offenders, harmful });

const hhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};

async function main() {
  const courses = await prisma.course.findMany({
    select: {
      id: true, code: true, nameHe: true, nameEn: true, credits: true,
      courseType: true, isMandatory: true, isActive: true, discipline: true,
      yearOffered: true, semesterOffered: true, prerequisites: true,
      examDateA: true, examDateB: true, submissionType: true,
      averageGrade: true, failRate: true,
    },
  });
  const active = courses.filter((c) => c.isActive);
  const byCode = new Map(courses.map((c) => [c.code.replace(/-/g, ""), c]));

  const sessions = await prisma.scheduleSession.findMany({
    select: {
      id: true, courseCode: true, dayOfWeek: true, startTime: true, endTime: true,
      sessionType: true, groupCode: true, semester: true, room: true,
    },
  });
  const courseByCode = new Map(courses.map((c) => [c.code.replace(/-/g, ""), c]));
  const sessionCourse = (s: { courseCode: string }) => courseByCode.get(s.courseCode.replace(/-/g, ""));

  const label = (c: { code: string; nameHe: string }) => `${c.code}  ${c.nameHe}`;

  // ── שמות ────────────────────────────────────────────────────────────
  // A name that is really the course's own code is the failure that made it
  // to production before: the row looks populated and says nothing.
  add(
    "name-is-code",
    "האם יש קורס ששמו הוא בעצם הקוד שלו?",
    active.filter((c) => /^\d{4}-?\d{4}$/.test(c.nameHe.trim())).map(label),
  );
  add(
    "name-too-short",
    "האם יש שם קורס קצר מדי מכדי להיות שם?",
    active.filter((c) => c.nameHe.trim().length < 4).map(label),
  );
  add(
    "name-truncated",
    "האם יש שם שנראה קטוע (נגמר במקף, בפסיק, או במילת חיבור)?",
    // The first version of this check ended its character class with the
    // letter ו, so it flagged every name ending in vav — אריסטו, ימינו,
    // בהודו, זמננו — four perfectly good titles reported as damaged. A check
    // that cries wolf is a check that stops being read, so the conjunction is
    // now matched as its own WORD rather than as a final letter.
    active
      .filter((c) => /[-,]$|\s(ו|של|עם|את|בין|לפי|על|מן)$/.test(c.nameHe.trim()))
      .map(label),
  );
  add(
    "name-leaked-column",
    "האם דלף לשם ערך מעמודה שכנה (״שנתי״, ״סמסטריאלי״, ש״ס)?",
    active
      .filter((c) => /\b(שנתי|סמסטריאלי|ש״ס|שס)\s*$/.test(c.nameHe.trim()))
      .map(label),
  );

  // ── ש״ס ─────────────────────────────────────────────────────────────
  add("credits-zero", "האם יש קורס פעיל עם 0 ש״ס?", active.filter((c) => c.credits <= 0).map(label));
  add(
    "credits-absurd",
    "האם יש קורס עם מספר ש״ס לא סביר (מעל 8)?",
    active.filter((c) => c.credits > 8).map((c) => `${label(c)} — ${c.credits} ש״ס`),
  );

  // ── שנה וסמסטר ──────────────────────────────────────────────────────
  add(
    "year-out-of-range",
    "האם יש קורס שמשויך לשנה שאינה 1–3?",
    active
      .filter((c) => c.yearOffered.some((y) => y < 1 || y > 3))
      .map((c) => `${label(c)} — [${c.yearOffered}]`),
  );
  add(
    "semester-invalid",
    "האם יש קורס עם סמסטר שאינו FALL/SPRING/SUMMER?",
    active
      .filter((c) => c.semesterOffered.map(String).some((s) => !["FALL", "SPRING", "SUMMER"].includes(s)))
      .map((c) => `${label(c)} — [${c.semesterOffered}]`),
  );
  add(
    "mandatory-no-placement",
    "האם יש קורס חובה בלי שנה או בלי סמסטר — כלומר שלא ייכנס לאף תכנון?",
    active
      .filter((c) => (c.courseType === "MANDATORY" || c.isMandatory) &&
        (c.yearOffered.length === 0 || c.semesterOffered.length === 0))
      .map(label),
  );

  // ── דרישות קדם ──────────────────────────────────────────────────────
  add(
    "prereq-dangling",
    "האם יש דרישת קדם שמצביעה על קורס שלא קיים בקטלוג?",
    active.flatMap((c) =>
      c.prerequisites
        .filter((p) => !byCode.has(p.replace(/-/g, "")))
        .map((p) => `${label(c)} → ${p} (לא קיים)`),
    ),
  );
  add(
    "prereq-self",
    "האם יש קורס שהוא דרישת הקדם של עצמו?",
    active
      .filter((c) => c.prerequisites.some((p) => p.replace(/-/g, "") === c.code.replace(/-/g, "")))
      .map(label),
  );

  // ── מועדי בחינה ─────────────────────────────────────────────────────
  const now = new Date();
  add(
    "exam-past",
    "האם יש קורס פעיל שמועד הבחינה שלו כבר עבר — כלומר ייעלם ממסכי המבחנים בשקט?",
    active
      .filter((c) => c.examDateA && c.examDateA < now)
      .map((c) => `${label(c)} — ${c.examDateA!.toISOString().slice(0, 10)}`),
  );
  add(
    "exam-b-before-a",
    "האם יש קורס שמועד ב׳ שלו לפני מועד א׳?",
    active
      .filter((c) => c.examDateA && c.examDateB && c.examDateB < c.examDateA)
      .map((c) => `${label(c)} — א׳ ${c.examDateA!.toISOString().slice(0,10)} · ב׳ ${c.examDateB!.toISOString().slice(0,10)}`),
  );
  add(
    "exam-same-day",
    "האם יש קורס ששני המועדים שלו באותו יום — כלומר אחד מהם שגוי?",
    active
      .filter((c) => c.examDateA && c.examDateB &&
        c.examDateA.toISOString().slice(0, 10) === c.examDateB.toISOString().slice(0, 10))
      .map(label),
  );
  add(
    "exam-on-exam-course-missing",
    "האם יש קורס שנבחן בבחינה ואין לו שום מועד?",
    active
      .filter((c) => String(c.submissionType) === "EXAM" && !c.examDateA && !c.examDateB)
      .map(label),
    false, // an unpublished sitting is a fact about the world, not a bug
  );
  add(
    "exam-on-paper-course",
    "האם יש קורס שמסתיים בעבודה ובכל זאת יש לו מועד בחינה?",
    active
      .filter((c) => ["PAPER", "REFERAT", "NONE"].includes(String(c.submissionType)) && (c.examDateA || c.examDateB))
      .map((c) => `${label(c)} — ${c.submissionType}`),
  );

  // ── שעות ────────────────────────────────────────────────────────────
  add(
    "time-malformed",
    "האם יש מפגש עם שעה לא חוקית?",
    sessions
      .filter((s) => hhmm(s.startTime) == null || hhmm(s.endTime) == null)
      .map((s) => `${sessionCourse(s)?.code ?? s.courseCode} — ${s.startTime}–${s.endTime}`),
  );
  add(
    "time-inverted",
    "האם יש מפגש שנגמר לפני שהוא מתחיל?",
    sessions
      .filter((s) => {
        const a = hhmm(s.startTime), b = hhmm(s.endTime);
        return a != null && b != null && b <= a;
      })
      .map((s) => `${sessionCourse(s)?.code ?? s.courseCode} — ${s.startTime}–${s.endTime}`),
  );
  add(
    "time-absurd",
    "האם יש מפגש באורך לא סביר (מעל 6 שעות, או קצר מ-30 דקות)?",
    sessions
      .filter((s) => {
        const a = hhmm(s.startTime), b = hhmm(s.endTime);
        if (a == null || b == null || b <= a) return false;
        const mins = b - a;
        return mins > 360 || mins < 30;
      })
      .map((s) => `${sessionCourse(s)?.code ?? s.courseCode} — ${s.startTime}–${s.endTime}`),
  );
  add(
    "time-outside-day",
    "האם יש מפגש מחוץ לשעות לימוד סבירות (לפני 08:00 או אחרי 22:00)?",
    sessions
      .filter((s) => {
        const a = hhmm(s.startTime), b = hhmm(s.endTime);
        return a != null && b != null && (a < 8 * 60 || b > 22 * 60);
      })
      .map((s) => `${sessionCourse(s)?.code ?? s.courseCode} — ${s.startTime}–${s.endTime}`),
    false,
  );
  add(
    "session-saturday",
    "האם יש מפגש בשבת?",
    sessions
      .filter((s) => String(s.dayOfWeek) === "SATURDAY")
      .map((s) => `${sessionCourse(s)?.code ?? s.courseCode} — ${s.startTime}`),
  );

  // A group that collides with ITSELF is the one clash a student cannot solve
  // by choosing differently.
  const selfClash: string[] = [];
  const byGroup = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = `${s.courseCode}|${s.semester}|${s.sessionType}|${s.groupCode ?? ""}`;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(s);
  }
  for (const [k, list] of byGroup) {
    const byDay = new Map<string, typeof sessions>();
    for (const s of list) {
      if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, []);
      byDay.get(s.dayOfWeek)!.push(s);
    }
    for (const [, day] of byDay) {
      const sorted = [...day].sort((a, b) => (hhmm(a.startTime) ?? 0) - (hhmm(b.startTime) ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const prevEnd = hhmm(sorted[i - 1]!.endTime);
        const curStart = hhmm(sorted[i]!.startTime);
        const sameSlot =
          sorted[i - 1]!.startTime === sorted[i]!.startTime &&
          sorted[i - 1]!.endTime === sorted[i]!.endTime;
        if (!sameSlot && prevEnd != null && curStart != null && curStart < prevEnd) {
          const c = sessionCourse(sorted[i]!);
          selfClash.push(`${c ? label(c) : k} — ${sorted[i - 1]!.startTime}–${sorted[i - 1]!.endTime} מול ${sorted[i]!.startTime}–${sorted[i]!.endTime}`);
        }
      }
    }
  }
  // Two rows describing the SAME meeting are a duplicate, not a clash. Both
  // are faults, but they read differently and they are fixed differently —
  // and reporting 126 "clashes" that were all "16:00–18:00 מול 16:00–18:00"
  // buried the real question under a wrong label.
  add("group-self-clash", "האם יש קבוצה שמתנגשת עם עצמה (חפיפה אמיתית)?", [...new Set(selfClash)]);

  // Two rows for one meeting. After the 190 outright duplicates were deleted,
  // what is left is the ידיעון itself publishing the same class in two rooms —
  // 0616-6037 in 102 and 106, 0651-2030 in 305 and 317. That is the source's
  // shape, not our error, and `filterSessionsByGroups` collapses it before the
  // grid, the clash detector or the campus-day count ever see it.
  //
  // So this is reported as a NOTE, not a fault — with one exception: rows that
  // are identical INCLUDING the room are ours, and those are a fault.
  const dupSessions = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = [s.courseCode, s.dayOfWeek, s.startTime, s.endTime, s.sessionType, s.groupCode ?? "", s.semester ?? ""].join("|");
    if (!dupSessions.has(k)) dupSessions.set(k, []);
    dupSessions.get(k)!.push(s);
  }
  const dupGroups = [...dupSessions.values()].filter((v) => v.length > 1);
  const describe = (rows: typeof sessions) => {
    const r = rows[0]!;
    const c = courseByCode.get(r.courseCode.replace(/-/g, ""));
    const rooms = [...new Set(rows.map((x) => x.room ?? "—"))];
    return `${c ? label(c) : r.courseCode} — ${r.dayOfWeek} ${r.startTime}–${r.endTime} · ${rows.length} שורות · חדרים ${rooms.join("/")}`;
  };
  add(
    "session-duplicated-identical",
    "האם יש מפגש שנשמר פעמיים כולל אותו חדר — כלומר כפילות שלנו?",
    dupGroups.filter((rows) => new Set(rows.map((r) => r.room ?? "")).size === 1).map(describe),
  );
  add(
    "session-duplicated-rooms",
    "האם הידיעון מפרסם את אותו שיעור בשני חדרים? (מקובץ ברינדור — לא מזיק)",
    dupGroups.filter((rows) => new Set(rows.map((r) => r.room ?? "")).size > 1).map(describe),
    false,
  );

  add(
    "course-no-sessions",
    "האם יש קורס פעיל בלי שום מפגש בלוח — כלומר לא ניתן לשבץ אותו במערכת?",
    active
      .filter((c) => !sessions.some((s) => s.courseCode.replace(/-/g, "") === c.code.replace(/-/g, "")))
      .map(label),
    false, // a course with no timetable rows is common in the catalog
  );

  // ── כפילויות ────────────────────────────────────────────────────────
  const codeCount = new Map<string, number>();
  for (const c of courses) {
    const k = c.code.replace(/-/g, "");
    codeCount.set(k, (codeCount.get(k) ?? 0) + 1);
  }
  add(
    "duplicate-code",
    "האם יש קוד קורס שמופיע פעמיים?",
    [...codeCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} — ${n} שורות`),
  );

  const nameCount = new Map<string, string[]>();
  for (const c of active) {
    const k = c.nameHe.trim();
    if (!nameCount.has(k)) nameCount.set(k, []);
    nameCount.get(k)!.push(c.code);
  }
  add(
    "duplicate-name",
    "האם יש שם קורס זהה תחת שני קודים שונים?",
    [...nameCount.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => `${k} — ${v.join(" · ")}`),
    false, // legitimately happens (a course renumbered between faculties)
  );

  // ── ציונים חיצוניים ─────────────────────────────────────────────────
  add(
    "grade-out-of-range",
    "האם יש ממוצע היסטורי שאינו ציון (מתחת ל-0 או מעל 100)?",
    active
      .filter((c) => c.averageGrade != null && (c.averageGrade < 0 || c.averageGrade > 100))
      .map((c) => `${label(c)} — ${c.averageGrade}`),
  );
  add(
    "failrate-out-of-range",
    "האם יש אחוז נכשלים שאינו אחוז?",
    active
      .filter((c) => c.failRate != null && (c.failRate < 0 || c.failRate > 100))
      .map((c) => `${label(c)} — ${c.failRate}`),
  );

  // ── דוח ─────────────────────────────────────────────────────────────
  console.log(`בדיקת מהימנות — ${courses.length} קורסים (${active.length} פעילים) · ${sessions.length} מפגשים\n`);

  let harmfulFails = 0;
  let softFails = 0;
  for (const c of checks) {
    const n = c.offenders.length;
    if (n === 0) {
      console.log(`  ✓  ${c.question}`);
      continue;
    }
    if (c.harmful) harmfulFails++; else softFails++;
    console.log(`  ${c.harmful ? "✗" : "!"}  ${c.question}  → ${n}`);
    for (const o of c.offenders.slice(0, MAX_LISTED)) console.log(`         ${o}`);
    if (n > MAX_LISTED) console.log(`         … ועוד ${n - MAX_LISTED} (--verbose לרשימה מלאה)`);
  }

  console.log(`\n${"─".repeat(64)}`);
  console.log(`  בדיקות שעברו:        ${checks.filter((c) => c.offenders.length === 0).length}/${checks.length}`);
  console.log(`  כשלים שמטעים סטודנט: ${harmfulFails}`);
  console.log(`  הערות (לא מטעות):    ${softFails}`);
  if (harmfulFails === 0) {
    console.log("\n  אין שום נתון שמטעה סטודנט בבדיקות האלה.");
  } else {
    console.log("\n  יש נתונים שמטעים. לתקן לפני ההשקה.");
  }

  await prisma.$disconnect();
  if (harmfulFails > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
