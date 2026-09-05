// =========================================================================
// תיקוני נתונים מהידיעון תשפ״ז — 6.9
// =========================================================================
// כל שינוי כאן נשען על שורה מפורשת בקובץ הידיעון שאריאל העלה ב-5.9, ומתועד
// בדוחות docs/אימות-ידיעון-6.9.md ו-docs/אימות-מערכת-שעות-6.9.md.
//
// ריצה ראשונה תמיד יבשה. להחיל:  npx tsx scripts/fix-from-yedion-6.9.ts --apply
//
// גיבוי: הסקריפט כותב את כל השורות שהוא נוגע בהן ל-
// docs/גיבוי-לפני-תיקון-6.9.json לפני שהוא משנה משהו.

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

const APPLY = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

// ── 1. שמות שהידיעון כותב אחרת, ואצלנו זו טעות ולא קיצור מכוון ──
// (קיצורים מכוונים כמו "+ תרגיל" או "מאקרו כלכלה" נשארים — הם החלטת מוצר.)
const NAME_FIXES: Record<string, string> = {
  "0910-1000": "דיני איכות הסביבה",
  "0621-1974": 'וצדק לכל? ארה"ב במאות ה-19 וה-20',
  "1882-0301": "צעדים ראשונים במדעי המחשב ותכנות בפייתון",
  "1882-1002": "פוליטיקה אנושית: מוות, חופש וחיפוש משמעות",
  "1031-3854": "דילמות במלחמות מודרניות",
  "0618-1059": "מבוא לאסתטיקה ולפילוסופיה של האמנות",
  "0618-2350": "תורת ההכרה ומטאפיזיקה - שיעור המשך",
  "1031-3939": "סוגיות בביטחון הלאומי של ישראל",
  "1031-3994": "סוגיות מתקדמות בפוליטיקה הישראלית",
  "0622-1001": 'מבוא לתולדות המזה"ת בעת החדשה',
  "1031-3983": "מומחים לפוליטיקה",
  "0618-7175": "מבוא עכשווי לפילוסופיה של הנפש",
  // הידיעון: "סמינר פכ"מ: התמחות מעשית" — השם שלנו לא אמר מה הקורס הוא.
  "0651-3007": 'סמינר פכ"מ: התמחות מעשית',
  // הידיעון: "קורס אינטגרטיבי לפכ"מ: כלכלה פוליטית בינלאומית". אריאל עצמו
  // קורא לו "קורס אינטגרטיבי לפכ״מ" — הכינוי שלנו הפך את הראשי למשני.
  "0651-1010": 'קורס אינטגרטיבי לפכ"מ: כלכלה פוליטית בינלאומית',
};

// ── 2. מפגשים שצריך למחוק: הידיעון לא מכיר אותם והם סותרים אותו ──
const DELETE_SESSIONS: { code: string; group: string; type: string; semester: string }[] = [
  // פוליטיקה השוואתית — הידיעון תשפ״ז: קבוצה 10, שיעור, **סמסטר ב׳**,
  // יום ג 10:00–13:00, פרופ' אהוד זומר. אצלנו ישבו שתי הרצאות בסמסטר א׳
  // (ראשון ורביעי 10:00–12:00) — נתון של שנה קודמת. זה קורס **חובה** של
  // שנה ב׳ סמסטר ב׳, וזו בדיוק הסיבה שסמסטר ב׳ נראה לאריאל "ריק מדי":
  // התרגילים היו שם והשיעור לא.
  { code: "1031-1108", group: "10", type: "lecture", semester: "FALL" },
];

// ── 3. מפגשים להוספה, מילה במילה מלוח השעות של הידיעון ──
const ADD_SESSIONS = [
  {
    code: "1031-1108",
    groupCode: "10",
    sessionType: "lecture",
    dayOfWeek: "TUESDAY" as const,
    startTime: "10:00",
    endTime: "13:00",
    semester: "SPRING" as const,
    lecturerName: "פרופ' אהוד זומר",
    building: 'בנין ע"ש פרץ נפתלי-הפקולטה למדעי החברה',
    room: "101",
  },
  {
    code: "1411-9101",
    groupCode: "10",
    sessionType: "lecture",
    dayOfWeek: "SUNDAY" as const,
    startTime: "10:00",
    endTime: "12:00",
    semester: "FALL" as const,
    lecturerName: 'ד"ר יפעת רבקה נפתלי בן ציון',
    building: "הפקולטה למשפטים - בנין טרובוביץ",
    room: "105",
  },
  {
    code: "1411-9101",
    groupCode: "10",
    sessionType: "lecture",
    dayOfWeek: "WEDNESDAY" as const,
    startTime: "10:00",
    endTime: "12:00",
    semester: "FALL" as const,
    lecturerName: 'ד"ר יפעת רבקה נפתלי בן ציון',
    building: "הפקולטה למשפטים - בנין טרובוביץ",
    room: "105",
  },
  {
    code: "1411-9109",
    groupCode: "01",
    sessionType: "lecture",
    dayOfWeek: "WEDNESDAY" as const,
    startTime: "10:00",
    endTime: "12:00",
    semester: "FALL" as const,
    lecturerName: "פרופ' יואב ספיר",
    building: "הפקולטה למשפטים - בנין טרובוביץ",
    room: "035",
  },
  {
    code: "1411-9109",
    groupCode: "01",
    sessionType: "lecture",
    dayOfWeek: "SUNDAY" as const,
    startTime: "10:00",
    endTime: "12:00",
    semester: "FALL" as const,
    lecturerName: "פרופ' יואב ספיר",
    building: "הפקולטה למשפטים - בנין טרובוביץ",
    room: "035",
  },
  {
    code: "1411-9240",
    groupCode: "10",
    sessionType: "lecture",
    dayOfWeek: "MONDAY" as const,
    startTime: "10:00",
    endTime: "12:00",
    semester: "FALL" as const,
    lecturerName: "פרופ' עמרי ידלין",
    building: "הפקולטה למשפטים - בנין טרובוביץ",
    room: "102",
  },
];

// ── 4. מפגש עם שעה שגויה ──
const RETIME = [
  {
    code: "1221-3301",
    group: "06",
    type: "tutorial",
    semester: "SPRING",
    from: "18:00",
    to: "18:30",
  },
];

async function main() {
  const backup: Record<string, unknown> = {};

  // גיבוי כל מה שנוגעים בו
  const touchedCodes = [
    ...Object.keys(NAME_FIXES),
    ...DELETE_SESSIONS.map((d) => d.code),
    ...ADD_SESSIONS.map((a) => a.code),
    ...RETIME.map((r) => r.code),
    "1031-1108",
  ];
  backup.courses = await prisma.course.findMany({ where: { code: { in: touchedCodes } } });
  backup.sessions = await prisma.scheduleSession.findMany({
    where: { courseCode: { in: touchedCodes } },
  });
  fs.writeFileSync(
    path.join(__dirname, "..", "docs", "גיבוי-לפני-תיקון-6.9.json"),
    JSON.stringify(backup, null, 1),
    "utf-8",
  );
  say(`גיבוי נכתב: ${(backup.courses as unknown[]).length} קורסים · ${(backup.sessions as unknown[]).length} מפגשים`);
  say("");

  // 1 · שמות
  say("## שמות");
  for (const [code, nameHe] of Object.entries(NAME_FIXES)) {
    const c = await prisma.course.findUnique({ where: { code }, select: { nameHe: true } });
    if (!c) {
      say(`  ⚠ ${code} לא קיים`);
      continue;
    }
    if (c.nameHe === nameHe) continue;
    say(`  ${code}: "${c.nameHe}" → "${nameHe}"`);
    if (APPLY) await prisma.course.update({ where: { code }, data: { nameHe } });
  }

  // 2 · פוליטיקה השוואתית — הסמסטר שבו הקורס באמת ניתן
  say("");
  say("## semesterOffered");
  const pol = await prisma.course.findUnique({
    where: { code: "1031-1108" },
    select: { semesterOffered: true },
  });
  if (pol && JSON.stringify(pol.semesterOffered) !== JSON.stringify(["SPRING"])) {
    say(`  1031-1108: ${JSON.stringify(pol.semesterOffered)} → ["SPRING"] (הידיעון: סמסטר ב׳ בלבד)`);
    if (APPLY)
      await prisma.course.update({
        where: { code: "1031-1108" },
        data: { semesterOffered: ["SPRING"] },
      });
  }

  // 3 · דיני חוזים — קורס יסוד משפטים שהיה כבוי
  say("");
  say("## isActive");
  const contracts = await prisma.course.findUnique({
    where: { code: "1411-9101" },
    select: { isActive: true, nameHe: true },
  });
  if (contracts && !contracts.isActive) {
    say(`  1411-9101 "${contracts.nameHe}" — היה כבוי; הידיעון מציע אותו כקורס יסוד משפטים לשנה ב׳`);
    if (APPLY) await prisma.course.update({ where: { code: "1411-9101" }, data: { isActive: true } });
  }

  // 4 · מחיקת מפגשים שהידיעון סותר
  say("");
  say("## מחיקת מפגשים");
  for (const d of DELETE_SESSIONS) {
    const rows = await prisma.scheduleSession.findMany({
      where: {
        courseCode: d.code,
        groupCode: d.group,
        sessionType: d.type,
        semester: d.semester as "FALL" | "SPRING" | "SUMMER",
      },
    });
    for (const r of rows) {
      say(`  ✂ ${d.code} קבוצה ${r.groupCode} ${r.sessionType} ${r.semester} ${r.dayOfWeek} ${r.startTime}–${r.endTime}`);
    }
    if (APPLY && rows.length > 0) {
      await prisma.scheduleSession.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
    }
  }

  // 5 · הוספת מפגשים מהידיעון
  say("");
  say("## הוספת מפגשים");
  for (const a of ADD_SESSIONS) {
    const exists = await prisma.scheduleSession.findFirst({
      where: {
        courseCode: a.code,
        groupCode: a.groupCode,
        sessionType: a.sessionType,
        semester: a.semester,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
      },
    });
    if (exists) {
      say(`  = ${a.code} ${a.groupCode} ${a.dayOfWeek} ${a.startTime} כבר קיים`);
      continue;
    }
    const course = await prisma.course.findUnique({ where: { code: a.code }, select: { code: true } });
    if (!course) {
      say(`  ⚠ ${a.code} לא קיים בקטלוג — מדלג`);
      continue;
    }
    say(`  + ${a.code} קבוצה ${a.groupCode} ${a.sessionType} ${a.semester} ${a.dayOfWeek} ${a.startTime}–${a.endTime}`);
    if (APPLY) {
      await prisma.scheduleSession.create({
        data: {
          courseCode: a.code,
          groupCode: a.groupCode,
          sessionType: a.sessionType,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
          semester: a.semester,
          academicYear: 2026,
          lecturerName: a.lecturerName,
          building: a.building,
          room: a.room,
        },
      });
    }
  }

  // 6 · שעה שגויה
  say("");
  say("## תיקון שעה");
  for (const r of RETIME) {
    const rows = await prisma.scheduleSession.findMany({
      where: {
        courseCode: r.code,
        groupCode: r.group,
        sessionType: r.type,
        semester: r.semester as "FALL" | "SPRING" | "SUMMER",
        startTime: r.from,
      },
    });
    for (const row of rows) {
      say(`  ${r.code} קבוצה ${r.group}: ${row.startTime} → ${r.to}`);
      if (APPLY)
        await prisma.scheduleSession.update({ where: { id: row.id }, data: { startTime: r.to } });
    }
  }

  say("");
  say(APPLY ? "✅ הוחל." : "🔍 ריצה יבשה בלבד. להחיל: --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
