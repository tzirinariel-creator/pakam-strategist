// =========================================
// Saved StudyTasks → ExamPlanResult (pure)
// =========================================
// The exam planner persists a generated plan as StudyTask rows (see
// study-task.ts: exam blocks noon-stamped with "מבחן: X (מועד ב׳)" titles and
// "[auto] <difficulty>" notes; study sessions at 09:00 with "[auto] Xh").
// This adapter reconstructs the ExamPlanResult so the committed plan renders
// on the exact same skyline as the live preview. Extracted from the component
// so the round-trip (generate → persist-shape → reconstruct) is unit-tested.

import type { ExamPlanResult, Difficulty } from "@/lib/exam-planner";

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
    totalHours: hoursByCourse.get(t.courseCode ?? "") ?? 2.5,
    color: t.color ?? "#6366f1",
  }));

  return { sessions, exams };
}
