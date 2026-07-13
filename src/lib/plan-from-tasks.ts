// =========================================
// Saved StudyTasks → ExamPlanResult (pure)
// =========================================
// The exam planner persists a generated plan as StudyTask rows (see
// study-task.ts: exam blocks noon-stamped with "מבחן: X (מועד ב׳)" titles and
// "[auto] <difficulty>" notes; study sessions at 09:00 with "[auto] Xh").
// This adapter reconstructs the ExamPlanResult so the committed plan renders
// on the exact same skyline as the live preview. Extracted from the component
// so the round-trip (generate → persist-shape → reconstruct) is unit-tested.

import type { ExamPlanResult, Difficulty, PrePlacedBlock } from "@/lib/exam-planner";

/** Notes marker for engine-generated tasks (exams + auto study blocks). */
export const AUTO_MARK = "[auto]";
/** A moved/locked auto block: re-tune leaves it and the engine treats its hours
 *  as pre-placed (fills around it) instead of wiping and re-scheduling. */
export const LOCK_MARK = "[locked]";

/** A study task survives a re-tune (its hours are pre-placed, not wiped) when
 *  it's a manual add (no [auto]) OR an auto block the student locked ([locked]). */
export function survivesRetune(notes: string | null): boolean {
  if (!notes) return true; // no marker at all → treat as a user block, don't wipe
  return !notes.includes(AUTO_MARK) || notes.includes(LOCK_MARK);
}

/** Build the pre-placed blocks a re-tune must fill AROUND: FUTURE, uncompleted
 *  STUDY tasks that survive (manual or locked), optionally limited to the
 *  courses being planned so a de-selected course's locks don't linger (D3). */
export function buildPrePlaced(
  tasks: Array<Pick<StudyTaskLike, "taskType" | "startDate" | "notes" | "courseCode"> & { completed?: boolean }>,
  today: Date,
  examCodes?: Set<string>,
): PrePlacedBlock[] {
  const t0 = new Date(new Date(today).setHours(0, 0, 0, 0)).getTime();
  const out: PrePlacedBlock[] = [];
  for (const t of tasks) {
    if (t.taskType !== "study" || t.completed) continue;
    if (!survivesRetune(t.notes)) continue;
    const code = t.courseCode ?? "";
    if (examCodes && !examCodes.has(code)) continue;
    const d = new Date(t.startDate);
    if (isNaN(d.getTime()) || new Date(new Date(d).setHours(0, 0, 0, 0)).getTime() < t0) continue;
    const m = t.notes?.match(/([\d.]+)h/);
    const h = m ? Number(m[1]) : NaN;
    out.push({ courseCode: code, date: d, hours: Number.isFinite(h) && h > 0 ? h : 2.5 });
  }
  return out;
}

export interface StudyTaskLike {
  taskType: string;
  startDate: Date | string;
  notes: string | null;
  courseCode: string | null;
  title: string;
  color: string | null;
}

function cleanCourseName(
  t: Pick<StudyTaskLike, "courseCode" | "title">,
  codeToName: Map<string, string>,
): string {
  return (
    (t.courseCode && codeToName.get(t.courseCode)) ||
    t.title.replace(/^[^:]*:\s*/, "").replace(/\s*\(מועד.*\)\s*$/, "")
  );
}

function diffFromNotes(notes: string | null): Difficulty {
  return notes?.includes("high") ? "high" : notes?.includes("low") ? "low" : "medium";
}

/** The persisted hour BUDGET (`budget=N`) — the original target, so the
 *  shortfall/overload recs reflect what SHOULD fit, not just what did. */
function budgetFromNotes(notes: string | null): number | null {
  const m = notes?.match(/budget=([\d.]+)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function planFromStudyTasks(
  tasks: StudyTaskLike[],
  codeToName: Map<string, string>,
  now: Date = new Date(),
): ExamPlanResult {
  const todayMs = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
  const dayMs = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };

  // Exam anchors first — FUTURE only (a stale saved plan whose exams have all
  // passed must not degenerate to a single "היום!" column). Their notes carry
  // the difficulty, which the study sessions (whose notes only carry hours)
  // inherit per course.
  const examTasks = tasks.filter(
    (t) => t.taskType === "exam" && dayMs(new Date(t.startDate)) >= todayMs,
  );
  const examDiffByCourse = new Map<string, Difficulty>();
  for (const t of examTasks) {
    if (t.courseCode) examDiffByCourse.set(t.courseCode, diffFromNotes(t.notes));
  }

  const sessions = tasks
    .filter((t) => t.taskType === "study" && dayMs(new Date(t.startDate)) >= todayMs)
    .map((t) => {
      const m = t.notes?.match(/([\d.]+)h/);
      const h = m ? Number(m[1]) : NaN;
      return {
        courseCode: t.courseCode ?? "",
        courseName: cleanCourseName(t, codeToName),
        date: new Date(t.startDate),
        hours: Number.isFinite(h) && h > 0 ? h : 2.5,
        color: t.color ?? "#6366f1",
        difficulty: ((t.courseCode && examDiffByCourse.get(t.courseCode)) || "medium") as Difficulty,
      };
    });

  const hoursByCourse = new Map<string, number>();
  for (const s of sessions) {
    hoursByCourse.set(s.courseCode, (hoursByCourse.get(s.courseCode) ?? 0) + s.hours);
  }

  const exams = examTasks.map((t) => ({
    courseCode: t.courseCode ?? "",
    courseName: cleanCourseName(t, codeToName),
    examDate: new Date(t.startDate),
    // Anchor to the "(מועד ב׳)" suffix — a course whose NAME contains "ב׳"
    // must not be misread as Moed B.
    moed: (/\(מועד\s*ב׳\)/.test(t.title) ? "B" : "A") as "A" | "B",
    difficulty: diffFromNotes(t.notes),
    // Prefer the persisted budget so the shortfall/overload recs and the skyline
    // legend stay honest on the saved plan; fall back to placed hours for plans
    // saved before budget was persisted.
    totalHours: budgetFromNotes(t.notes) ?? hoursByCourse.get(t.courseCode ?? "") ?? 2.5,
    color: t.color ?? "#6366f1",
  }));

  return { sessions, exams };
}
