// =========================================================================
// הידיעון מול הקטלוג — לשונית "תוכנית לימודים" של תשפ״ז, שורה־שורה
// =========================================================================
// אריאל, 5.9: *"תוודא ממש שורה שורה — אתה צריך קודם לוודא שאתה מבין היטב
// את הקובץ ואת המבנה שלו... טעות בשעה או בחובה או בזמן מבחן היא טעות
// דרמטית."*
//
// עד היום היה לנו מקור-אימות אחד בלבד — לוח המטלות של הידיעון
// (yedion-5787-assessments.json), שנותן שמות ומועדי בחינה אבל **לא** ש״ס.
// הקובץ שאריאל העלה הוא לשונית "תוכנית לימודים" המלאה, ובה לכל קורס:
//
//     0651-1005
//     סטטיסטיקה לפכ"מ
//     אופן הוראה
//     שיעור 5 ש"ס
//     תרגיל 0 ש"ס
//     סה"כ שעות
//     5
//
// כלומר: קוד, שם, פירוק שעות, וסה״כ ש״ס — בדיוק שלושת השדות שטעות בהם
// היא "דרמטית". בנוסף, ההיררכיה של העמוד ("שנה א׳" → "קורסי חובה
// מפילוסופיה" / "קורסי בחירה...") נותנת גם **שנה** וגם **חובה מול בחירה**.
//
// קריאה בלבד. לעולם לא כותב למסד.
//
//   npx tsx scripts/audit-yedion-5787-program.ts

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

interface YedionRow {
  line: number;
  code: string;
  name: string;
  modes: string[];
  total: string | null;
  year: string | null;
  sec: string | null;
  notes: string[];
}

/** משווים על משמעות, לא על טיפוגרפיה — הידיעון מרווח סימני פיסוק. */
const norm = (s: string) =>
  s
    .replace(/[֑-ׇ]/g, "")
    .replace(/["״'׳]/g, "")
    .replace(/[־–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const YEAR_NUM: Record<string, number> = { "שנה א'": 1, "שנה ב'": 2, "שנה ג'": 3 };

function isMandatorySection(sec: string | null): boolean | null {
  if (!sec) return null;
  if (sec.startsWith("קורסי חובה")) return true;
  if (sec.startsWith("קורסי בחירה")) return false;
  if (sec.startsWith("סמינרים")) return null; // סמינר — קטגוריה בפני עצמה
  if (sec.startsWith("קורסי יסוד")) return null; // סל יסוד: חובה לבחור מתוכו, לא קורס מסוים
  if (sec.startsWith("קורסי קריאה")) return null;
  if (sec === "משפטים") return true;
  return null;
}

async function main() {
  const raw: YedionRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "docs", "ידיעון-תשפז-גולמי.json"), "utf-8"),
  );

  // איחוד לפי קוד: אותו קורס מופיע בכמה שנים/סלים בידיעון.
  const yedion = new Map<
    string,
    { code: string; names: Set<string>; totals: Set<number>; years: Set<number>; sections: Set<string>; mandatory: Set<boolean>; notes: Set<string> }
  >();
  for (const r of raw) {
    if (!yedion.has(r.code)) {
      yedion.set(r.code, {
        code: r.code,
        names: new Set(),
        totals: new Set(),
        years: new Set(),
        sections: new Set(),
        mandatory: new Set(),
        notes: new Set(),
      });
    }
    const e = yedion.get(r.code)!;
    if (r.name) e.names.add(r.name);
    const n = r.total == null ? NaN : Number(r.total);
    if (Number.isFinite(n)) e.totals.add(n);
    const y = r.year ? YEAR_NUM[r.year] : undefined;
    if (y) e.years.add(y);
    if (r.sec) e.sections.add(r.sec);
    const m = isMandatorySection(r.sec);
    if (m !== null) e.mandatory.add(m);
    for (const note of r.notes) if (note.length < 200) e.notes.add(note);
  }

  const db = await prisma.course.findMany({
    where: { isActive: true },
    select: {
      code: true,
      nameHe: true,
      credits: true,
      courseType: true,
      discipline: true,
      yearOffered: true,
      semesterOffered: true,
      isActive: true,
    },
  });
  const byCode = new Map(db.map((c) => [c.code, c]));

  const out: string[] = [];
  const push = (s = "") => out.push(s);

  push("# אימות הידיעון (תשפ״ז, לשונית תוכנית לימודים) מול הקטלוג");
  push();
  push(`מקור: הקובץ שאריאל העלה ב-5.9 · ${raw.length} שורות קורס · ${yedion.size} קודים ייחודיים`);
  push(`הקטלוג שלנו: ${db.length} קורסים פעילים`);
  push();

  // ── 1. קורסים שבידיעון ואינם אצלנו ──
  const missing = [...yedion.values()].filter((y) => !byCode.has(y.code));
  push(`## 1 · בידיעון ולא אצלנו — ${missing.length}`);
  push();
  if (missing.length === 0) push("אין. כל קורס בלשונית הזאת קיים בקטלוג.");
  for (const m of missing) {
    push(
      `- \`${m.code}\` **${[...m.names][0]}** — ${[...m.totals].join("/")} ש״ס · ${[...m.sections].join(" · ")} · שנה ${[...m.years].join(",")}`,
    );
  }
  push();

  // ── 2. פערי ש״ס ──
  const creditGaps: string[] = [];
  for (const y of yedion.values()) {
    const c = byCode.get(y.code);
    if (!c) continue;
    const totals = [...y.totals];
    if (totals.length === 0) continue;
    if (!totals.includes(c.credits)) {
      creditGaps.push(
        `- \`${y.code}\` **${c.nameHe}** — אצלנו **${c.credits}** ש״ס · בידיעון **${totals.join(" / ")}**`,
      );
    }
  }
  push(`## 2 · פערי ש״ס — ${creditGaps.length}`);
  push();
  if (creditGaps.length === 0) push("אין. כל ש״ס תואם לידיעון.");
  for (const g of creditGaps) push(g);
  push();

  // ── 3. פערי סיווג חובה/בחירה ──
  const typeGaps: string[] = [];
  for (const y of yedion.values()) {
    const c = byCode.get(y.code);
    if (!c) continue;
    if (y.mandatory.size !== 1) continue; // מופיע גם כחובה וגם כבחירה — לא פער
    const yedionMandatory = [...y.mandatory][0]!;
    const ourMandatory = c.courseType === "MANDATORY";
    if (c.courseType === "SEMINAR") continue;
    if (yedionMandatory !== ourMandatory) {
      typeGaps.push(
        `- \`${y.code}\` **${c.nameHe}** — אצלנו \`${c.courseType}\` · בידיעון תחת "${[...y.sections].join(" · ")}"`,
      );
    }
  }
  push(`## 3 · פערי חובה מול בחירה — ${typeGaps.length}`);
  push();
  if (typeGaps.length === 0) push("אין.");
  for (const g of typeGaps) push(g);
  push();

  // ── 4. פערי שנה ──
  const yearGaps: string[] = [];
  for (const y of yedion.values()) {
    const c = byCode.get(y.code);
    if (!c) continue;
    if (y.years.size === 0) continue;
    const ours = new Set(c.yearOffered ?? []);
    if (ours.size === 0) {
      yearGaps.push(`- \`${y.code}\` **${c.nameHe}** — אצלנו ללא שנה · בידיעון שנה ${[...y.years].join(",")}`);
      continue;
    }
    const missingYears = [...y.years].filter((n) => !ours.has(n));
    if (missingYears.length > 0) {
      yearGaps.push(
        `- \`${y.code}\` **${c.nameHe}** — אצלנו שנים ${[...ours].join(",")} · בידיעון גם ${missingYears.join(",")}`,
      );
    }
  }
  push(`## 4 · פערי שנת הצעה — ${yearGaps.length}`);
  push();
  if (yearGaps.length === 0) push("אין.");
  for (const g of yearGaps) push(g);
  push();

  // ── 5. פערי שם ──
  const nameGaps: string[] = [];
  for (const y of yedion.values()) {
    const c = byCode.get(y.code);
    if (!c) continue;
    const ours = norm(c.nameHe);
    const anyMatch = [...y.names].some((n) => {
      const t = norm(n);
      return t === ours || ours.startsWith(t) || t.startsWith(ours);
    });
    if (!anyMatch) {
      nameGaps.push(`- \`${y.code}\` — אצלנו "${c.nameHe}" · בידיעון "${[...y.names].join('" / "')}"`);
    }
  }
  push(`## 5 · פערי שם — ${nameGaps.length}`);
  push();
  if (nameGaps.length === 0) push("אין.");
  for (const g of nameGaps) push(g);
  push();

  // ── 6. אצלנו ולא בלשונית הזאת ──
  const extra = db.filter((c) => !yedion.has(c.code));
  push(`## 6 · אצלנו ולא בלשונית הזאת — ${extra.length}`);
  push();
  push(
    "לשונית *תוכנית לימודים* מציגה את סלי התוכנית. קורס שאינו כאן אינו בהכרח שגוי — הוא יכול להגיע מלשונית *מערכת שעות* או מלוח המטלות — אבל כל שורה כאן דורשת הסבר.",
  );
  push();
  for (const c of extra) {
    push(`- \`${c.code}\` **${c.nameHe}** — ${c.credits} ש״ס · \`${c.courseType}\` · \`${c.discipline}\``);
  }
  push();

  const file = path.join(__dirname, "..", "docs", "אימות-ידיעון-6.9.md");
  fs.writeFileSync(file, out.join("\n"), "utf-8");
  console.log(out.join("\n").slice(0, 200));
  console.log(`\n… נכתב במלואו ל-docs/אימות-ידיעון-6.9.md`);
  console.log(
    `סיכום: חסרים ${missing.length} · ש״ס ${creditGaps.length} · חובה/בחירה ${typeGaps.length} · שנה ${yearGaps.length} · שם ${nameGaps.length} · עודפים ${extra.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
