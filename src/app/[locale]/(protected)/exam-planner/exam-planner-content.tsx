"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  ListChecks,
  Lightbulb,
  Plus,
  Check,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { AskKingButton } from "@/components/ui/ask-king-button";
import {
  generateExamPlan,
  analyzeExamPeriod,
  recommendMoed,
  explainBudget,
  DEFAULT_CAPACITY,
  type ExamInput,
  type ExamPlanResult,
} from "@/lib/exam-planner";
import { StudySkyline } from "@/components/exam-planner/study-skyline";
import { WeeklyGrid } from "@/components/exam-planner/weekly-grid";
import dynamic from "next/dynamic";
// PERF1: syllabus scanner (zod schema + parsing) is behind a button — lazy.
const SyllabusScanner = dynamic(
  () => import("@/components/exam-planner/syllabus-scanner").then((m) => m.SyllabusScanner),
  { ssr: false },
);
import { MoedBenefitBanner } from "@/components/exam-planner/moed-benefit-banner";
import { ExamPlanWizard, MoedPrinciplesCard, type PrepStyle } from "@/components/exam-planner/exam-plan-wizard";
import { planFromStudyTasks, buildPrePlaced } from "@/lib/plan-from-tasks";
import { downloadGanttCsv, type GanttTask } from "@/lib/excel-export";
import { exportExamPlanXlsx } from "@/lib/xlsx-export";
import { cn } from "@/lib/utils";
import { dayKey, taskHours, type Moed, type StudyTask } from "@/components/exam-planner/exam-planner-utils";
import { Agenda } from "@/components/exam-planner/agenda";
import { Disclosure } from "@/components/exam-planner/disclosure";
import { ShareMenu } from "@/components/exam-planner/share-menu";
import { ExamSeasonWisdom } from "@/components/exam-planner/exam-season-wisdom";

export function ExamPlannerContent() {
  const isHe = useLocale() === "he";
  const { greetName, g } = usePersonalAddress();
  const utils = api.useUtils();

  const planQuery = api.plan.getUserPlan.useQuery();
  const tasksQuery = api.studyTask.list.useQuery();

  const invalidate = () => utils.studyTask.list.invalidate();

  const generateMutation = api.studyTask.generateExamPlan.useMutation({
    onSuccess: (r) => {
      void invalidate();
      toast.success(isHe ? `נבנתה תוכנית: ${r.sessions ?? 0} מפגשי לימוד` : `Plan built: ${r.sessions ?? 0} study sessions`);
    },
    onError: () => advisorError(isHe ? "בניית התוכנית לא הצליחה — נסו שוב. הבחירות שלכם נשמרו." : "Building the plan didn't work — try again. Your picks are kept."),
  });
  const createMutation = api.studyTask.create.useMutation({ onSuccess: () => void invalidate() });
  const toggleMutation = api.studyTask.toggleComplete.useMutation({ onSuccess: () => void invalidate() });
  const deleteMutation = api.studyTask.delete.useMutation({ onSuccess: () => void invalidate() });
  const updateMutation = api.studyTask.update.useMutation({ onSuccess: () => void invalidate() });
  // Silent twin for whole-day pushes — the caller invalidates ONCE at the end
  // instead of firing N refetches for N moved tasks.
  const batchUpdateMutation = api.studyTask.update.useMutation();

  // Courses with an UPCOMING exam sitting (past sittings dropped — #13).
  const examCourses = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const futureOnly = (d: Date | null): Date | null => (d && d.getTime() >= now.getTime() ? d : null);
    const out: { code: string; name: string; credits: number; examDateA: Date | null; examDateB: Date | null; averageGrade: number | null; failRate: number | null }[] = [];
    const seen = new Set<string>();
    for (const uc of planQuery.data?.courses ?? []) {
      const c = uc.course;
      if (seen.has(c.code)) continue;
      if (uc.status === "COMPLETED" && uc.grade != null) continue;
      const examDateA = futureOnly(c.examDateA ? new Date(c.examDateA) : null);
      const examDateB = futureOnly(c.examDateB ? new Date(c.examDateB) : null);
      if (!examDateA && !examDateB) continue;
      seen.add(c.code);
      out.push({ code: c.code, name: c.nameHe, credits: c.credits, examDateA, examDateB, averageGrade: c.averageGrade, failRate: c.failRate });
    }
    // #37 (12.7) — the picker lists exams in CHRONOLOGICAL order (earliest
    // upcoming sitting first), not catalog order.
    const earliest = (c: (typeof out)[number]) =>
      Math.min(c.examDateA?.getTime() ?? Infinity, c.examDateB?.getTime() ?? Infinity);
    out.sort((a, b) => earliest(a) - earliest(b));
    return out;
  }, [planQuery.data]);

  const hasAnyPlannedCourses = (planQuery.data?.courses?.length ?? 0) > 0;

  const [selected, setSelected] = useState<Record<string, Moed | undefined>>({});
  // Phase 3 — per-course self-reported readiness (1-5). Ephemeral like
  // blockedDays; unset = neutral (engine treats it as 1.0×). NOT a grade
  // prediction — the student's own read on how ready they feel.
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  // 13.7 #25 — the student's OWN hours per exam. Unset = the formula's
  // estimate (which the UI now explains); set = their number wins outright.
  const [hoursOverride, setHoursOverride] = useState<Record<string, number>>({});
  // #34 (12.7) — courses assessed by a PAPER / alternative assessment (מתווה
  // תשפ"ו) have no exam to plan: marked here, they leave the picker + skyline,
  // and get a gentle "add your submission deadline" pointer instead.
  const [altAssessment, setAltAssessment] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("pk-alt-assessment") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggleAltAssessment = (code: string) => {
    setAltAssessment((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else {
        next.add(code);
        setSelected((sel) => ({ ...sel, [code]: undefined }));
      }
      try {
        localStorage.setItem("pk-alt-assessment", JSON.stringify([...next]));
      } catch { /* storage blocked — session-only */ }
      return next;
    });
  };
  // Skyline→agenda link (#37); n bumps so re-clicking the same day re-scrolls.
  const [focusDay, setFocusDay] = useState<{ key: string; n: number } | null>(null);
  // Wizard tuning (#37) — prep style + blocked days feed the preview and the
  // generate call. blockedDays are the engine's already-supported `unavailable`.
  const [prepStyle, setPrepStyle] = useState<PrepStyle>("steady");
  const [blockedDays, setBlockedDays] = useState<string[]>([]);
  // Phase 2 — study hours available per weekday (0=Sun…6=Sat). Seeds from the
  // sane default; the wizard lets the student adjust. Ephemeral like blockedDays.
  const [weekdayHours, setWeekdayHours] = useState<number[]>(DEFAULT_CAPACITY.weekdayHours);
  // STATE B "re-tune" — reopens the wizard over the saved plan.
  const [retuneOpen, setRetuneOpen] = useState(false);

  const codeToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of examCourses) m.set(c.code, c.name);
    return m;
  }, [examCourses]);

  const previewInputs = useMemo(() => {
    const inputs: ExamInput[] = [];
    for (const c of examCourses) {
      const moed = selected[c.code];
      if (!moed) continue;
      const date = moed === "B" ? c.examDateB : c.examDateA;
      if (!date) continue;
      // prepStyle "light" = "already started, just review" → 25% fewer hours.
      // The engine budgets by credits, so scaling credits scales the plan
      // (min 1 kept so a course never drops to zero sessions). steady/crammer
      // don't reshape the client preview — the engine owns the window.
      const credits = prepStyle === "light" ? Math.max(1, Math.round(c.credits * 0.75)) : c.credits;
      inputs.push({ courseCode: c.code, courseName: c.name, examDate: date, credits, averageGrade: c.averageGrade, failRate: c.failRate, confidence: confidence[c.code], hoursOverride: hoursOverride[c.code], moed });
    }
    return inputs;
  }, [examCourses, selected, prepStyle, confidence, hoursOverride]);

  const previewPlan = useMemo(() => {
    // Fill around the student's locked/manual blocks so the preview matches what
    // a re-tune will actually save (Phase 5 D4). Empty in the fresh setup (no
    // saved tasks). Same pure helper the server mutation uses — no divergence.
    const now = new Date();
    const pre = buildPrePlaced(
      (tasksQuery.data?.tasks ?? []) as StudyTask[],
      now,
      new Set(previewInputs.map((e) => e.courseCode)),
    );
    const fresh = generateExamPlan(previewInputs, now, blockedDays, prepStyle, { weekdayHours }, pre);
    // The engine returns only the FRESH fill-around sessions (the locked blocks
    // already exist in the DB, which is why the server persists just these). But
    // for the PREVIEW display + the shortfall rec, merge the pre-placed blocks
    // back in so the preview shows the FULL arrangement (locks + fill-around) and
    // "placed" hours include the locks — otherwise the warning false-fires.
    if (pre.length === 0) return fresh;
    const byCourse = new Map(fresh.exams.map((e) => [e.courseCode, e]));
    const locked = pre.flatMap((p) => {
      const sum = byCourse.get(p.courseCode);
      return sum ? [{ courseCode: p.courseCode, courseName: sum.courseName, date: new Date(p.date), hours: p.hours, color: sum.color, difficulty: sum.difficulty }] : [];
    });
    return { ...fresh, sessions: [...fresh.sessions, ...locked].sort((a, b) => a.date.getTime() - b.date.getTime()) };
  }, [previewInputs, blockedDays, prepStyle, weekdayHours, tasksQuery.data]);
  const previewRecs = useMemo(() => (previewInputs.length === 0 ? [] : analyzeExamPeriod(previewPlan, isHe)), [previewInputs, previewPlan, isHe]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleGenerate = () => {
    const exams = examCourses.filter((c) => selected[c.code]).map((c) => ({ courseCode: c.code, moed: selected[c.code] as Moed }));
    if (exams.length === 0) {
      toast.error(isHe ? "בחרו לפחות מבחן אחד" : "Pick at least one exam");
      return;
    }
    // blockedDays → the engine's already-supported `unavailable` (days it won't
    // schedule study on). Sent as local YYYY-MM-DD keys, matching the engine.
    generateMutation.mutate({
      exams,
      unavailable: blockedDays.length > 0 ? blockedDays : undefined,
      prepStyle, // apply the SAME scaling the wizard preview showed (#audit-r3)
      capacity: { weekdayHours }, // the same capacity the preview used
      confidence: Object.keys(confidence).length > 0 ? confidence : undefined,
      hoursOverride: Object.keys(hoursOverride).length > 0 ? hoursOverride : undefined,
    });
    setRetuneOpen(false);
  };

  // Re-tune honesty (13.7 #25 depth): the saved exam blocks carry the wizard
  // answers (`conf=K`, `own=1` + `budget=N`), so reopening the wizard re-seeds
  // the SAME assumptions the student approved instead of silently resetting to
  // neutral. In-session edits win (seed only fills unset keys, once).
  const seededFromSave = useRef(false);
  useEffect(() => {
    if (!retuneOpen || seededFromSave.current) return;
    seededFromSave.current = true;
    const conf: Record<string, number> = {};
    const own: Record<string, number> = {};
    for (const t of (tasksQuery.data?.tasks ?? []) as StudyTask[]) {
      if (t.taskType !== "exam" || !t.courseCode || !t.notes) continue;
      const mc = /\bconf=([1-5])\b/.exec(t.notes);
      if (mc) conf[t.courseCode] = Number(mc[1]);
      if (t.notes.includes("own=1")) {
        const mb = /\bbudget=(\d+)\b/.exec(t.notes);
        if (mb) own[t.courseCode] = Number(mb[1]);
      }
    }
    if (Object.keys(conf).length) setConfidence((p) => ({ ...conf, ...p }));
    if (Object.keys(own).length) setHoursOverride((p) => ({ ...own, ...p }));
  }, [retuneOpen, tasksQuery.data]);

  const tasks = useMemo(() => (tasksQuery.data?.tasks ?? []) as StudyTask[], [tasksQuery.data]);
  const byDay = useMemo(() => {
    const map = new Map<string, StudyTask[]>();
    for (const t of tasks.slice().sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())) {
      const key = dayKey(new Date(t.startDate));
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return Array.from(map.entries());
  }, [tasks]);

  const toGantt = (): GanttTask[] =>
    tasks.map((t) => ({
      title: t.title,
      courseCode: t.courseCode,
      courseLabel: t.courseCode ? (codeToName.get(t.courseCode) ?? t.title.replace(/^.*?:\s*/, "")) : t.title,
      date: new Date(t.startDate),
      taskType: t.taskType,
      color: t.color,
      hours: taskHours(t),
    }));

  const persistedPlan = useMemo<ExamPlanResult>(() => planFromStudyTasks(tasks, codeToName), [tasks, codeToName]);
  const persistedRecs = useMemo(() => analyzeExamPeriod(persistedPlan, isHe), [persistedPlan, isHe]);

  // #15/#34 — the colored three-sheet Excel (plan table + gantt grid + agenda
  // checklist). Exports the PERSISTED plan — exactly what's on screen,
  // including manual drags — never a regenerated one.
  const exportXlsx = async () => {
    const ok = await exportExamPlanXlsx(persistedPlan, { isHe });
    if (ok) {
      toast.success(isHe ? "האקסל ירד — לוח שבועי, תוכנית ואג'נדה" : "Excel downloaded — weekly grid, plan and agenda");
    } else {
      toast.info(isHe ? "אין עדיין תוכנית לייצוא — בנו תוכנית קודם" : "Nothing to export yet — build a plan first");
    }
  };

  const exportIcs = () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pakamon//ExamPlan//HE"];
    for (const t of tasks) {
      lines.push("BEGIN:VEVENT", `UID:${t.id}@pakamon`, `DTSTART:${fmt(new Date(t.startDate))}`, `DTEND:${fmt(new Date(t.endDate))}`, `SUMMARY:${t.title.replace(/\n/g, " ")}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isHe ? "תוכנית-מבחנים.ics" : "exam-plan.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(isHe ? "יוצא ליומן — אפשר לייבא ל-Google Calendar" : "Exported — import to Google Calendar");
  };

  // Push a task one day later (both start + end) — the existing update mutation,
  // no schema change. Lets a student slip a session without deleting + re-adding.
  const pushDay = (t: StudyTask) => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
    updateMutation.mutate({ id: t.id, startDate: start, endDate: end });
  };

  // E2′ (note 37) — drag a course's study block from one skyline day to
  // another: move that course's OPEN study tasks of the source day to the
  // target day (same clock time + duration), saved immediately through the
  // existing update mutation. Exams never move.
  const moveCourseDay = async (courseCode: string, fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const movable = (tasksQuery.data?.tasks ?? []).filter(
      (t) =>
        t.taskType === "study" &&
        !t.completed &&
        t.courseCode === courseCode &&
        dayKey(new Date(t.startDate)) === fromKey,
    );
    if (movable.length === 0) return;
    const [y, m, d] = toKey.split("-").map(Number);
    if (!y || !m || !d) return;
    try {
      await Promise.all(
        movable.map((t) => {
          const start = new Date(t.startDate);
          const duration = new Date(t.endDate).getTime() - start.getTime();
          start.setFullYear(y, m - 1, d);
          // Phase 5 — a MOVE is a manual arrangement to keep: stamp [locked] so a
          // re-tune fills around it instead of wiping it. Preserve the "Nh" token
          // so the hours still parse.
          const lockedNotes = t.notes?.includes("[locked]")
            ? t.notes
            : `${(t.notes ?? "").trim()} [locked]`.trim();
          return batchUpdateMutation.mutateAsync({
            id: t.id,
            startDate: start,
            endDate: new Date(start.getTime() + Math.max(0, duration)),
            notes: lockedNotes,
          });
        }),
      );
      toast.success(isHe ? "הבלוק הוזז ונשמר" : "Moved and saved");
    } catch {
      toast.error(isHe ? "ההזזה לא נשמרה — נסו שוב" : "The move didn't save — try again");
    } finally {
      void invalidate();
    }
  };

  // Push a WHOLE day (#37): every open study/assignment slips +1; the exam
  // itself never moves. One invalidate at the end, not N refetches.
  const pushWholeDay = async (list: StudyTask[]) => {
    const movable = list.filter((t) => t.taskType !== "exam" && !t.completed);
    if (movable.length === 0) return;
    try {
      await Promise.all(
        movable.map((t) => {
          const start = new Date(t.startDate);
          const end = new Date(t.endDate);
          start.setDate(start.getDate() + 1);
          end.setDate(end.getDate() + 1);
          return batchUpdateMutation.mutateAsync({ id: t.id, startDate: start, endDate: end });
        }),
      );
      toast.success(isHe ? "היום נדחה במלואו למחר" : "Day pushed to tomorrow");
    } catch {
      toast.error(isHe ? "חלק מהמשימות לא נדחו — נסו שוב" : "Some tasks didn't move — try again");
    } finally {
      void invalidate();
    }
  };

  // Quick-add a 2.5h study session to a given day (#37) — one chip tap.
  // notes WITHOUT "[auto]" so "עדכן את התוכנית" never wipes manual additions.
  const quickAdd = (key: string, course: { code: string; name: string; color: string | null }) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    const start = new Date(yy!, mm! - 1, dd!, 9, 0, 0, 0);
    const end = new Date(start.getTime() + 2.5 * 3600000);
    createMutation.mutate({
      title: isHe ? `לימוד: ${course.name}` : `Study: ${course.name}`,
      startDate: start,
      endDate: end,
      taskType: "study",
      courseCode: course.code,
      color: course.color ?? undefined,
      notes: "2.5h",
    });
  };

  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addType, setAddType] = useState<"assignment" | "custom" | "study">("assignment");
  // 13.7 #25 — a manual study block's length is the student's to set (the old
  // silent 2.5h default was an unexplained magic number).
  const [addHours, setAddHours] = useState(2.5);
  const handleAdd = () => {
    if (!addTitle.trim() || !addDate) {
      toast.error(isHe ? "מלאו כותרת ותאריך" : "Fill a title and date");
      return;
    }
    const d = new Date(addDate);
    const end = new Date(d);
    end.setHours(23, 59, 0, 0);
    // A "study" block must carry its hours in notes ("2.5h") like the per-day
    // quick-add does — otherwise the skyline counts it as 2.5h (its missing-hours
    // default) while the weekly grid and agenda count it as 0, so the same day
    // shows three different totals and the 2.5h is an unsourced invented number
    // (QA 13.7). Assignment/custom carry no hours, so no notes.
    createMutation.mutate({
      title: addTitle.trim(),
      startDate: d,
      endDate: end,
      taskType: addType,
      notes: addType === "study" ? `${addHours}h` : undefined,
    });
    setAddTitle("");
    setAddDate("");
  };

  if (planQuery.isLoading) return <ThemedLoader />;

  const hasPlan = tasks.length > 0;

  // ── Shared sub-renders ────────────────────────────────────────────────
  const pickExamsPanel = (
    <div className="data-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="size-5 text-accent-brand" />
        <h2 className="font-display text-base font-bold text-foreground/85">{isHe ? "בחרו מבחנים" : "Pick exams"}</h2>
        {selectedCount > 0 && <span className="ms-auto text-xs text-foreground/50">{selectedCount} {isHe ? "נבחרו" : "selected"}</span>}
      </div>
      {examCourses.length === 0 ? (
        !hasAnyPlannedCourses ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-foreground/60">
              {isHe ? "עוד אין לכם תכנית לימודים. בנו תכנית קודם — ואז נמשוך משם את תאריכי המבחנים." : "You don't have a study plan yet. Build one first — exam dates come from there."}
            </p>
            <Link href="/planner" className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover">
              <GraduationCap className="size-4" />
              {isHe ? "לבניית התכנית" : "Build my plan"}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-foreground/50">
            {isHe ? "אין מבחנים קרובים בתכנית שלכם. (מבחנים שכבר עברו אינם מוצגים.)" : "No upcoming exams in your plan. (Past sittings are hidden.)"}
          </p>
        )
      ) : (
        <div className="space-y-2">
          {/* E3′ (note 32) — why Moed A is the default, in one honest line. */}
          <p className="text-[11px] leading-relaxed text-foreground/45">
            {isHe
              ? "ברירת המחדל היא מועד א׳ — רוב הסטודנטים ניגשים אליו, ומועד ב׳ נשאר כרשת ביטחון (שימו לב: הציון האחרון קובע)."
              : "Moed A is the default — most students take it, keeping Moed B as the safety net (note: the last grade counts)."}
          </p>
          {examCourses.filter((c) => !altAssessment.has(c.code)).map((c) => {
            const sel = selected[c.code];
            // Recommend a sitting against the OTHER selected exams' chosen
            // dates (#32): default A (last grade counts — B is the safety
            // net), B only when A is crowded and B is not.
            const otherChosenDates = examCourses
              .filter((o) => o.code !== c.code && selected[o.code])
              .map((o) => (selected[o.code] === "B" ? o.examDateB : o.examDateA))
              .filter((d): d is Date => !!d);
            const recommended = recommendMoed(c, otherChosenDates);
            return (
              <div key={c.code} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2.5", sel ? "border-accent-brand/30 bg-accent-brand/[0.04]" : "border-border/50")}>
                <button type="button" onClick={() => setSelected((s) => ({ ...s, [c.code]: sel ? undefined : (recommended ?? "A") }))} className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors", sel ? "border-accent-brand bg-accent-brand text-accent-brand-fg" : "border-foreground/30")} aria-label="select">
                  {sel && <Check className="size-3.5" />}
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{c.name}</span>
                <span className="font-mono text-[11px] text-foreground/40">{c.credits} ש״ס</span>
                <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
                  {(["A", "B"] as Moed[]).map((m) => {
                    const date = m === "A" ? c.examDateA : c.examDateB;
                    const active = sel === m;
                    const isRec = recommended === m && !!date;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={!date}
                        onClick={() => setSelected((s) => ({ ...s, [c.code]: m }))}
                        // E3′ — a missing sitting says so honestly, never a bare dash.
                        title={!date ? (isHe ? "התאריך טרם פורסם" : "Date not published yet") : undefined}
                        className={cn("flex flex-col items-center px-2.5 py-1 transition-colors disabled:opacity-40", active ? "bg-accent-brand text-accent-brand-fg" : "text-foreground/55 hover:bg-foreground/5")}
                      >
                        <span className="flex items-center gap-1 leading-tight">
                          {isHe ? `מועד ${m === "A" ? "א׳" : "ב׳"}` : `Moed ${m}`}
                          {isRec && !active && (
                            <span className="rounded-full bg-accent-brand/10 px-1 text-[11px] font-semibold text-accent-brand">
                              {isHe ? "מומלץ" : "rec."}
                            </span>
                          )}
                        </span>
                        <span className={cn("font-mono text-[10px] tabular-nums leading-tight opacity-80", !date && "font-sans")} dir={date ? "ltr" : undefined}>
                          {date ? `${date.getDate()}.${date.getMonth() + 1}` : isHe ? "טרם פורסם" : "TBA"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {sel && (
                  <div className="flex basis-full items-center gap-2 pt-1">
                    <span className="text-[11px] text-foreground/50">{isHe ? "כמה אתם מרגישים מוכנים?" : "How ready do you feel?"}</span>
                    <div className="flex overflow-hidden rounded-md border border-border/60">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={isHe ? `רמת מוכנות ${n}` : `readiness ${n}`}
                          onClick={() => setConfidence((p) => ({ ...p, [c.code]: n }))}
                          className={cn(
                            "px-2 py-0.5 text-xs tabular-nums transition-colors",
                            confidence[c.code] === n ? "bg-accent-brand text-accent-brand-fg" : "text-foreground/50 hover:bg-foreground/5",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-foreground/35">{isHe ? "פחות מוכנים = יותר שעות" : "less ready = more hours"}</span>
                  </div>
                )}
                {sel && (() => {
                  // 13.7 #25 — "למה 12 שעות למיקרו?" answered IN the product, and
                  // the number itself is the student's to change. Same inputs the
                  // engine uses (incl. the "light" credits scaling), so the line
                  // never disagrees with the plan.
                  const effCredits = prepStyle === "light" ? Math.max(1, Math.round(c.credits * 0.75)) : c.credits;
                  const exp = explainBudget({
                    credits: effCredits,
                    averageGrade: c.averageGrade,
                    failRate: c.failRate,
                    confidence: confidence[c.code],
                    hoursOverride: hoursOverride[c.code],
                  });
                  // Only claim the Arazim source when there IS data behind the
                  // classification; unknown course → an honest default label.
                  const hasSignal = c.averageGrade != null || c.failRate != null;
                  const diffHe = hasSignal
                    ? `קורס ${exp.difficulty === "high" ? "קשה" : exp.difficulty === "low" ? "קל" : "בינוני"} לפי נתוני ארזים`
                    : "אין נתוני עבר — הנחנו בינוני";
                  const diffEn = hasSignal
                    ? `${exp.difficulty === "high" ? "hard" : exp.difficulty === "low" ? "easy" : "medium"} per Arazim data`
                    : "no history — assumed medium";
                  return (
                    <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[11px] text-foreground/50">{isHe ? "שעות לימוד:" : "Study hours:"}</span>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        step={1}
                        value={hoursOverride[c.code] ?? exp.total}
                        aria-label={isHe ? `שעות לימוד ל${c.name}` : `Study hours for ${c.name}`}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setHoursOverride((p) => {
                            const next = { ...p };
                            if (!Number.isFinite(v) || v <= 0) delete next[c.code];
                            else next[c.code] = Math.min(120, Math.round(v));
                            return next;
                          });
                        }}
                        className="w-14 rounded-md border border-border/60 bg-transparent px-1.5 py-0.5 text-center font-mono text-xs tabular-nums text-foreground/80 focus:border-accent-brand focus:outline-none"
                      />
                      {exp.overridden ? (
                        <span className="text-[10px] text-foreground/40">
                          {isHe ? `קבעתם בעצמכם (ההערכה שלנו: ${exp.estimated} שע׳) · ` : `Your call (our estimate: ${exp.estimated}h) · `}
                          <button
                            type="button"
                            onClick={() => setHoursOverride((p) => { const n = { ...p }; delete n[c.code]; return n; })}
                            className="text-accent-brand hover:underline"
                          >
                            {isHe ? "חזרו להערכה" : "back to estimate"}
                          </button>
                        </span>
                      ) : (
                        <span className="text-[10px] text-foreground/40">
                          {isHe
                            ? `ההערכה שלנו: ${effCredits} ש״ס × ${exp.perCredit} שע׳ (${diffHe}${exp.multiplier !== 1 ? ` · מוכנות ×${exp.multiplier}` : ""}) — אפשר לשנות`
                            : `Our estimate: ${effCredits} cr × ${exp.perCredit}h (${diffEn}${exp.multiplier !== 1 ? ` · readiness ×${exp.multiplier}` : ""}) — yours to change`}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => toggleAltAssessment(c.code)}
                  title={isHe ? "אין מבחן בקורס הזה? סמנו — והוא יֵצא מתכנון המבחנים" : "No exam in this course? Mark it out of the exam plan"}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-foreground/45 transition-colors hover:border-foreground/30 hover:text-foreground/70"
                >
                  {isHe ? "עבודה במקום מבחן?" : "Paper instead?"}
                </button>
              </div>
            );
          })}
          {altAssessment.size > 0 && (
            <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5 text-[11px] leading-relaxed text-foreground/55">
              <p className="font-semibold text-foreground/65">
                {isHe ? "בהערכה חלופית / עבודה (לא בתכנון המבחנים):" : "Alternative assessment (out of the exam plan):"}
              </p>
              {examCourses.filter((c) => altAssessment.has(c.code)).map((c) => (
                <p key={c.code} className="mt-1 flex flex-wrap items-center gap-2">
                  <span>{c.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleAltAssessment(c.code)}
                    className="text-accent-brand hover:underline"
                  >
                    {isHe ? "בעצם יש מבחן — החזירו" : "Actually has an exam — restore"}
                  </button>
                </p>
              ))}
              <p className="mt-1.5 text-foreground/40">
                {isHe
                  ? "טיפ: הוסיפו את דדליין-ההגשה דרך \"הוסיפו תאריכים וכלים\" למטה — והוא יופיע בציר לצד המבחנים."
                  : "Tip: add the submission deadline via \"add dates & tools\" below — it shows on the timeline beside the exams."}
              </p>
            </div>
          )}
          {/* #39 (12.7) — no build button here: building happens at the END of
              the wizard, after the blocked-days + style questions were answered. */}
          <p className="mt-2 text-center text-[11px] text-foreground/40">
            {isHe ? "אחרי הבחירה — המשיכו בשלבים למעלה עד לבניית התוכנית." : "After picking — continue through the steps above to build the plan."}
          </p>
        </div>
      )}
    </div>
  );

  const manualAddCard = (
    <div className="data-card p-4">
      <label className="mb-1.5 block text-[11px] font-medium text-foreground/55">{isHe ? "הוספה ידנית — מטלה, משמרת או לימוד" : "Add manually — task, shift, or study"}</label>
      <div className="flex flex-wrap items-end gap-2">
        <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder={isHe ? "למשל: הגשת עבודה במאקרו" : "e.g. Macro assignment due"} className="min-w-0 flex-1 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm focus:border-foreground/30 focus:outline-none" />
        <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground/80 focus:border-foreground/30 focus:outline-none" />
        <select value={addType} onChange={(e) => setAddType(e.target.value as typeof addType)} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground/80 focus:outline-none">
          <option value="assignment">{isHe ? "מטלה" : "Assignment"}</option>
          <option value="custom">{isHe ? "אישי/עבודה" : "Personal/work"}</option>
          <option value="study">{isHe ? "לימוד" : "Study"}</option>
        </select>
        {addType === "study" && (
          <label className="flex items-center gap-1.5 text-[11px] text-foreground/55">
            {isHe ? "שעות:" : "Hours:"}
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={addHours}
              onChange={(e) => setAddHours(Math.min(12, Math.max(0.5, Number(e.target.value) || 2.5)))}
              className="w-16 rounded-lg border border-border/60 bg-card px-2 py-2 text-center font-mono text-sm tabular-nums text-foreground/80 focus:border-foreground/30 focus:outline-none"
            />
          </label>
        )}
        <button type="button" onClick={handleAdd} className="inline-flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/15">
          <Plus className="size-4" />
          {isHe ? "הוסף" : "Add"}
        </button>
      </div>
    </div>
  );

  // withKing only on the SAVED plan (#15): in preview state there is no
  // persisted StudyTask yet, so the King would just point back to this screen.
  const recsCard = (recs: { kind: string; textHe: string; textEn: string }[], withKing = false) =>
    recs.length > 0 ? (
      <div className="data-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="size-4 text-accent-brand" />
          <h3 className="text-sm font-bold text-foreground/85">{isHe ? "המלצות" : "Recommendations"}</h3>
          {withKing && (
            <AskKingButton
              promptHe="בוא נחשוב יחד על תוכנית המבחנים שלי — תשאל אותי מה שחסר לך, ואז תגיד מה היית משנה."
              promptEn="Let's think through my exam plan together — ask me what you need, then tell me what you'd change."
              labelHe="לחשוב על זה עם המלך"
              labelEn="Think it through with the King"
              className="ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-brand transition-colors hover:bg-accent-brand/10 hover:text-accent-brand"
              iconClassName="size-3"
            />
          )}
        </div>
        <ul className="space-y-1.5">
          {recs.map((r, i) => (
            <li key={i} className={cn("flex items-start gap-2 text-xs leading-relaxed", r.kind === "clash" || r.kind === "deferB" || r.kind === "capacity" ? "text-amber-600" : "text-foreground/70")}>
              {(r.kind === "clash" || r.kind === "deferB" || r.kind === "capacity") && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
              <span>{isHe ? r.textHe : r.textEn}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  // Personalized, gendered header line — reads like a person, not a form.
  const headerTitle = hasPlan
    ? isHe ? "תקופת המבחנים שלכם" : "Your exam period"
    : greetName
      ? isHe ? `${g("יאללה", "יאללה", "יאללה")} ${greetName}, ${g("בוא נסדר", "בואי נסדר", "בוא/י נסדר")} את תקופת המבחנים` : `Let's sort your exam period, ${greetName}`
      : isHe ? "תכנון תקופת המבחנים" : "Exam-period planner";

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Personalized header + a single share menu (ICS primary, CSV secondary). */}
      <div className="animate-stagger-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground/85">{headerTitle}</h1>
            <p className="text-xs text-foreground/50">
              {isHe ? "לוח לימוד חכם — אחורה מכל מבחן." : "A smart study schedule, reverse-planned from each exam."}
            </p>
          </div>
        </div>
        {hasPlan && <ShareMenu isHe={isHe} onXlsx={exportXlsx} onIcs={exportIcs} onCsv={() => downloadGanttCsv(toGantt(), isHe)} />}
      </div>

      {hasPlan ? (
        // ── STATE B — the daily driver: skyline hero → today-first agenda ──
        <>
          {persistedPlan.exams.length > 0 && (
            <div className="animate-stagger-2">
              <StudySkyline
                plan={persistedPlan}
                recommendations={persistedRecs}
                isHe={isHe}
                onDayClick={(key) => setFocusDay((f) => ({ key, n: (f?.n ?? 0) + 1 }))}
                onMoveCourseDay={(courseCode, fromKey, toKey) => void moveCourseDay(courseCode, fromKey, toKey)}
              />
            </div>
          )}
          {persistedPlan.exams.length > 0 && (
            <div className="animate-stagger-2">
              <WeeklyGrid
                plan={persistedPlan}
                byDay={byDay}
                isHe={isHe}
                courses={persistedPlan.exams.map((e) => ({ code: e.courseCode, name: e.courseName, color: e.color }))}
                onMoveCourseDay={(courseCode, fromKey, toKey) => void moveCourseDay(courseCode, fromKey, toKey)}
                onQuickAdd={quickAdd}
                onDelete={(id) => deleteMutation.mutate({ id })}
                onDayClick={(key) => setFocusDay((f) => ({ key, n: (f?.n ?? 0) + 1 }))}
              />
            </div>
          )}
          <Agenda
            byDay={byDay}
            isHe={isHe}
            onToggle={(id) => toggleMutation.mutate({ id })}
            onDelete={(id) => deleteMutation.mutate({ id })}
            onPush={pushDay}
            onPushDay={(list) => void pushWholeDay(list)}
            courses={persistedPlan.exams.map((e) => ({ code: e.courseCode, name: e.courseName, color: e.color }))}
            onQuickAdd={quickAdd}
            focusDay={focusDay}
          />
          {recsCard(persistedRecs, true)}
          <Disclosure title={isHe ? "כוונון מחדש / הוסיפו תאריכים וכלים" : "Re-tune / add dates & tools"}>
            <div className="flex flex-col gap-4">
              <MoedPrinciplesCard isHe={isHe} />
              {retuneOpen ? (
                <ExamPlanWizard
                  isHe={isHe}
                  pickPanel={pickExamsPanel}
                  previewSkyline={
                    previewPlan.exams.length > 0 ? (
                      <StudySkyline plan={previewPlan} recommendations={previewRecs} isHe={isHe} />
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-6 text-center text-sm text-foreground/45">
                        {isHe ? "בחרו מבחן כדי לראות תצוגה מקדימה." : "Pick an exam to see a preview."}
                      </p>
                    )
                  }
                  recsCard={recsCard(previewRecs)}
                  selectedCount={selectedCount}
                  prepStyle={prepStyle}
                  onPrepStyle={setPrepStyle}
                  blockedDays={blockedDays}
                  onBlockedDays={setBlockedDays}
                  weekdayHours={weekdayHours}
                  onWeekdayHours={setWeekdayHours}
                  onFinish={handleGenerate}
                  finishBusy={generateMutation.isPending}
                  finishLabel={generateMutation.isPending ? (isHe ? "מעדכן…" : "Updating…") : isHe ? "עדכן את התוכנית" : "Update the plan"}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Seed the wizard from the SAVED plan so re-tuning starts from
                    // the current exam picks instead of an empty state that leaves
                    // the Update button disabled and forgets the picks (#audit-r3).
                    const seeded: Record<string, Moed | undefined> = {};
                    for (const e of persistedPlan.exams) {
                      if (e.courseCode) seeded[e.courseCode] = e.moed;
                    }
                    setSelected(seeded);
                    setRetuneOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent-brand/30 bg-accent-brand/[0.04] px-4 py-2.5 text-sm font-semibold text-accent-brand transition-colors hover:bg-accent-brand/10"
                >
                  <ListChecks className="size-4" />
                  {isHe ? "כוונון מחדש של התוכנית" : "Re-tune the plan"}
                </button>
              )}
              <SyllabusScanner />
              {manualAddCard}
            </div>
          </Disclosure>
        </>
      ) : (
        // ── STATE A — setup: 4-step wizard wrapping the exam-picking panel ──
        <>
          <MoedBenefitBanner />
          <ExamSeasonWisdom isHe={isHe} />
          <MoedPrinciplesCard isHe={isHe} />
          <div className="animate-stagger-2">
            <ExamPlanWizard
              isHe={isHe}
              pickPanel={pickExamsPanel}
              previewSkyline={
                previewPlan.exams.length > 0 ? (
                  <StudySkyline plan={previewPlan} recommendations={previewRecs} isHe={isHe} />
                ) : (
                  <p className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-6 text-center text-sm text-foreground/45">
                    {isHe ? "חזרו לצעד 1 ובחרו מבחן כדי לראות תצוגה מקדימה." : "Go back to step 1 and pick an exam to see a preview."}
                  </p>
                )
              }
              recsCard={recsCard(previewRecs)}
              selectedCount={selectedCount}
              prepStyle={prepStyle}
              onPrepStyle={setPrepStyle}
              blockedDays={blockedDays}
              onBlockedDays={setBlockedDays}
              weekdayHours={weekdayHours}
              onWeekdayHours={setWeekdayHours}
              onFinish={handleGenerate}
              finishBusy={generateMutation.isPending}
              finishLabel={generateMutation.isPending ? (isHe ? "בונה תוכנית…" : "Building…") : isHe ? "בנה לי תוכנית לימוד" : "Build my study plan"}
            />
          </div>
          <Disclosure title={isHe ? "עוד דרכים להוסיף תאריכים" : "Other ways to add dates"}>
            <div className="flex flex-col gap-4">
              <SyllabusScanner />
              {manualAddCard}
            </div>
          </Disclosure>
        </>
      )}
    </div>
  );
}
