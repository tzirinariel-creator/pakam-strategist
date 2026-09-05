// =========================================================================
// מערכת השעות של הידיעון מול ScheduleSession שלנו — שעה־שעה
// =========================================================================
// אריאל, 5.9: *"טעות בשעה או בחובה או בזמן מבחן היא טעות דרמטית."*
//
// לשונית "מערכת שעות" בידיעון תשפ״ז נותנת לכל קורס את כל הקבוצות עם
// אופן-הוראה, סמסטר, מרצה, מיקום, יום ושעה. זה המקור היחיד שאפשר להשוות
// אליו את `ScheduleSession`, ובלעדיו כל שעה באפליקציה היא טענה שלנו בלבד.
//
// קריאה בלבד.
//
//   npx tsx scripts/audit-yedion-schedule.ts

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

interface YSession {
  group: string | null;
  mode: string | null;
  freq: string | null;
  sem: string | null;
  teacher: string | null;
  loc: string | null;
  day: string | null;
  start: string;
  end: string;
}
interface YCourse {
  code: string;
  name: string;
  sessions: YSession[];
}

/** יום בעברית → ה-enum שלנו. */
const DAY_ENUM: Record<string, string> = {
  א: "SUNDAY",
  ב: "MONDAY",
  ג: "TUESDAY",
  ד: "WEDNESDAY",
  ה: "THURSDAY",
  ו: "FRIDAY",
};
const DAY_HE: Record<string, string> = {
  SUNDAY: "א",
  MONDAY: "ב",
  TUESDAY: "ג",
  WEDNESDAY: "ד",
  THURSDAY: "ה",
  FRIDAY: "ו",
};
/** סמסטר בידיעון → ה-enum שלנו. */
const SEM: Record<string, string> = { "א": "FALL", "ב": "SPRING", "קיץ": "SUMMER" };
/** אופן הוראה → ה-sessionType שלנו (מאוחסן באותיות קטנות). */
const MODE: Record<string, string> = {
  "שיעור": "lecture",
  "שעור": "lecture",
  "שיעור מקוון": "lecture",
  "תרגיל": "tutorial",
  "תרגול": "tutorial",
  "סמינר": "seminar",
  "פרוסמינר": "seminar",
  "סדנה": "workshop",
  "מעבדה": "lab",
};

const hhmm = (s: string) => {
  const [h, m] = s.split(":");
  return `${String(Number(h)).padStart(2, "0")}:${m}`;
};

async function main() {
  const yedion: YCourse[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "docs", "ידיעון-תשפז-מערכת-שעות.json"),
      "utf-8",
    ),
  );

  const rows = await prisma.scheduleSession.findMany({
    select: {
      courseCode: true,
      sessionType: true,
      groupCode: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      semester: true,
      lecturerName: true,
      room: true,
      building: true,
    },
  });
  const byCode = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCode.get(r.courseCode) ?? [];
    list.push(r);
    byCode.set(r.courseCode, list);
  }

  const out: string[] = [];
  const push = (s = "") => out.push(s);
  push("# מערכת השעות: הידיעון מול הקטלוג (תשפ״ז)");
  push();
  push(
    `הידיעון: ${yedion.length} קורסים · ${yedion.reduce((s, c) => s + c.sessions.length, 0)} מפגשים`,
  );
  push(`אצלנו: ${byCode.size} קורסים עם שעות · ${rows.length} מפגשים`);
  push();

  const noSchedule: string[] = [];
  const timeGaps: string[] = [];
  const missingGroups: string[] = [];
  let matched = 0;

  for (const yc of yedion) {
    const ours = byCode.get(yc.code);
    if (!ours || ours.length === 0) {
      noSchedule.push(`- \`${yc.code}\` **${yc.name}** — ${yc.sessions.length} מפגשים בידיעון, ואצלנו אין שעות בכלל`);
      continue;
    }
    for (const s of yc.sessions) {
      if (!s.day || !s.group) continue;
      const day = DAY_ENUM[s.day];
      const sem = s.sem ? SEM[s.sem] : undefined;
      const type = s.mode ? MODE[s.mode] : undefined;
      const grp = String(Number(s.group));
      const cand = ours.filter(
        (r) =>
          String(Number(r.groupCode ?? "")) === grp &&
          (type == null || r.sessionType.toLowerCase() === type) &&
          (sem == null || r.semester === sem),
      );
      if (cand.length === 0) {
        missingGroups.push(
          `- \`${yc.code}\` **${yc.name}** — קבוצה ${s.group} (${s.mode ?? "?"}, סמ׳ ${s.sem ?? "?"}, יום ${s.day} ${s.start}–${s.end}) בידיעון · אין שורה תואמת אצלנו`,
        );
        continue;
      }
      const hit = cand.find(
        (r) =>
          r.dayOfWeek === day &&
          hhmm(r.startTime) === hhmm(s.start) &&
          hhmm(r.endTime) === hhmm(s.end),
      );
      if (hit) {
        matched += 1;
      } else {
        const c = cand[0]!;
        timeGaps.push(
          `- \`${yc.code}\` **${yc.name}** — קבוצה ${s.group} ${s.mode ?? ""}: בידיעון יום ${s.day} ${s.start}–${s.end} · אצלנו יום ${DAY_HE[c.dayOfWeek] ?? c.dayOfWeek} ${c.startTime}–${c.endTime}`,
        );
      }
    }
  }

  push(`## 1 · מפגשים שתואמים במדויק (יום + שעה) — ${matched}`);
  push();
  push(`## 2 · פערי יום/שעה — ${timeGaps.length}`);
  push();
  if (timeGaps.length === 0) push("אין.");
  for (const g of timeGaps) push(g);
  push();
  push(`## 3 · קבוצות שבידיעון ואין להן שורה אצלנו — ${missingGroups.length}`);
  push();
  if (missingGroups.length === 0) push("אין.");
  for (const g of missingGroups.slice(0, 120)) push(g);
  if (missingGroups.length > 120) push(`… ועוד ${missingGroups.length - 120}`);
  push();
  push(`## 4 · קורסים עם שעות בידיעון וללא שעות אצלנו — ${noSchedule.length}`);
  push();
  if (noSchedule.length === 0) push("אין.");
  for (const g of noSchedule) push(g);
  push();

  // ── 5. הכיוון ההפוך: שורות אצלנו שאין להן אח בידיעון ──
  // זה הצד שתופס נתון **ישן**, ובדיוק כך התגלה שהשיעור של "פוליטיקה
  // השוואתית" יושב אצלנו בסמסטר א׳ ביום ראשון, בזמן שהידיעון אומר סמסטר ב׳
  // ביום שלישי. השוואה בכיוון אחד בלבד לעולם לא הייתה תופסת אותו: היא
  // מחפשת התאמה לשורת-ידיעון, ושורה מיותרת אצלנו פשוט לא נבדקת.
  const yByCode = new Map(yedion.map((c) => [c.code, c]));
  const stale: string[] = [];
  for (const [code, list] of byCode) {
    const yc = yByCode.get(code);
    if (!yc) continue; // הידיעון לא פרסם שעות לקורס הזה — לא ראיה לכלום
    for (const r of list) {
      const grp = String(Number(r.groupCode ?? ""));
      const match = yc.sessions.some(
        (s) =>
          s.group != null &&
          String(Number(s.group)) === grp &&
          (s.mode == null || MODE[s.mode] === r.sessionType.toLowerCase()) &&
          (s.sem == null || SEM[s.sem] === r.semester) &&
          (s.day == null || DAY_ENUM[s.day] === r.dayOfWeek) &&
          hhmm(s.start) === hhmm(r.startTime) &&
          hhmm(s.end) === hhmm(r.endTime),
      );
      if (!match) {
        stale.push(
          `- \`${code}\` **${yc.name}** — אצלנו קבוצה ${r.groupCode} ${r.sessionType} ${r.semester === "FALL" ? "סמ׳ א׳" : r.semester === "SPRING" ? "סמ׳ ב׳" : r.semester} יום ${DAY_HE[r.dayOfWeek] ?? r.dayOfWeek} ${r.startTime}–${r.endTime} · אין מפגש כזה בידיעון`,
        );
      }
    }
  }
  push(`## 5 · שורות אצלנו שאין להן מפגש תואם בידיעון — ${stale.length}`);
  push();
  push(
    "כל שורה כאן היא שעה שהאפליקציה מציגה והידיעון לא מכיר — כלומר או נתון משנה קודמת שנשאר, או קבוצה שנסגרה. זה הצד המסוכן: סטודנט רואה שיעור ביום שאין בו שיעור.",
  );
  push();
  if (stale.length === 0) push("אין.");
  for (const g of stale) push(g);
  push();

  fs.writeFileSync(path.join(__dirname, "..", "docs", "אימות-מערכת-שעות-6.9.md"), out.join("\n"), "utf-8");
  console.log(
    `תואמים ${matched} · פערי שעה ${timeGaps.length} · קבוצות חסרות ${missingGroups.length} · קורסים בלי שעות ${noSchedule.length}`,
  );
  console.log("נכתב ל-docs/אימות-מערכת-שעות-6.9.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
