"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  CalendarClock,
  Sparkles,
  Wand2,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  CalendarPlus,
  GraduationCap,
  BookOpen,
  Briefcase,
  AlertTriangle,
  ArrowDown,
  ListChecks,
  X,
} from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { ThemedLoader } from "@/components/ui/themed-loader";
import {
  generateExamPlan,
  analyzeExamPeriod,
  type ExamInput,
  type ExamPlanResult,
  type Difficulty,
} from "@/lib/exam-planner";
import { StudySkyline } from "@/components/exam-planner/study-skyline";
import { SyllabusScanner } from "@/components/exam-planner/syllabus-scanner";
import { MoedBenefitBanner } from "@/components/exam-planner/moed-benefit-banner";
import { planFromStudyTasks } from "@/lib/plan-from-tasks";
import { downloadGanttCsv, type GanttTask } from "@/lib/excel-export";
import { cn } from "@/lib/utils";

type Moed = "A" | "B";

const TYPE_META: Record<string, { he: string; en: string; icon: React.ComponentType<{ className?: string }> }> = {
  exam: { he: "מבחן", en: "Exam", icon: GraduationCap },
  study: { he: "לימוד", en: "Study", icon: BookOpen },
  assignment: { he: "מטלה", en: "Assignment", icon: BookOpen },
  custom: { he: "אישי", en: "Personal", icon: Briefcase },
};

export function ExamPlannerContent() {
  const isHe = useLocale() === "he";
  const utils = api.useUtils();

  const planQuery = api.plan.getUserPlan.useQuery();
  const tasksQuery = api.studyTask.list.useQuery();

  const invalidate = () => utils.studyTask.list.invalidate();

  // After generating, the day-by-day plan lands far below the fold (past the
  // recommendations + manual-add form) — so it perceptually "vanished" behind a
  // toast (#10). We now (a) show an explicit "plan is ready → what's next" panel
  // right where the student is looking, and (b) auto-scroll to the timeline so
  // the concrete schedule is the thing they actually land on.
  const [genResult, setGenResult] = useState<{ sessions: number } | null>(null);
  const [pendingScroll, setPendingScroll] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollToPlan = () =>
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const generateMutation = api.studyTask.generateExamPlan.useMutation({
    onSuccess: (r) => {
      void invalidate();
      const sessions = r.sessions ?? 0;
      setGenResult({ sessions });
      setPendingScroll(true);
      toast.success(isHe ? `נוצרה תוכנית: ${sessions} מפגשי לימוד` : `Plan created: ${sessions} study sessions`);
    },
    onError: () => toast.error(isHe ? "יצירת התוכנית נכשלה" : "Failed to generate plan"),
  });
  const createMutation = api.studyTask.create.useMutation({ onSuccess: () => void invalidate() });
  const toggleMutation = api.studyTask.toggleComplete.useMutation({ onSuccess: () => void invalidate() });
  const deleteMutation = api.studyTask.delete.useMutation({ onSuccess: () => void invalidate() });

  // Courses that have an UPCOMING exam date (Moed A or B). Past sittings are
  // dropped so a student can't pick an exam that already happened (#13) — the
  // reverse-planner silently produces nothing for a past date, which read as
  // "lets you pick exams that already passed". Each sitting is filtered
  // independently: a course with a past Moed A but a future Moed B still shows,
  // offering only the B sitting.
  const examCourses = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const futureOnly = (d: Date | null): Date | null =>
      d && d.getTime() >= now.getTime() ? d : null;

    const out: {
      code: string;
      name: string;
      credits: number;
      examDateA: Date | null;
      examDateB: Date | null;
      averageGrade: number | null;
      failRate: number | null;
    }[] = [];
    const seen = new Set<string>();
    for (const uc of planQuery.data?.courses ?? []) {
      const c = uc.course;
      if (seen.has(c.code)) continue;
      // Skip a course already passed (graded) — no point planning its exam.
      if (uc.status === "COMPLETED" && uc.grade != null) continue;
      const examDateA = futureOnly(c.examDateA ? new Date(c.examDateA) : null);
      const examDateB = futureOnly(c.examDateB ? new Date(c.examDateB) : null);
      if (!examDateA && !examDateB) continue; // both sittings past (or none)
      seen.add(c.code);
      out.push({
        code: c.code,
        name: c.nameHe,
        credits: c.credits,
        examDateA,
        examDateB,
        averageGrade: c.averageGrade,
        failRate: c.failRate,
      });
    }
    return out;
  }, [planQuery.data]);

  // Distinguish "no plan at all" (mid-degree student who hasn't planned) from
  // "plan has no upcoming exams" — so #16's empty state guides instead of dead-ends.
  const hasAnyPlannedCourses = (planQuery.data?.courses?.length ?? 0) > 0;

  // Selection: code → chosen moed (or undefined = not selected).
  const [selected, setSelected] = useState<Record<string, Moed | undefined>>({});

  const codeToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of examCourses) m.set(c.code, c.name);
    return m;
  }, [examCourses]);

  // The chosen exams as planner inputs — lifted out so the live-preview skyline
  // and the recommendations share one computation (no double generateExamPlan).
  const previewInputs = useMemo(() => {
    const inputs: ExamInput[] = [];
    for (const c of examCourses) {
      const moed = selected[c.code];
      if (!moed) continue;
      const date = moed === "B" ? c.examDateB : c.examDateA;
      if (!date) continue;
      inputs.push({ courseCode: c.code, courseName: c.name, examDate: date, credits: c.credits, averageGrade: c.averageGrade, failRate: c.failRate, moed });
    }
    return inputs;
  }, [examCourses, selected]);

  // Live plan + recommendations from the current selection (pure, client-side) —
  // this is what the preview skyline renders, updating as exams / Moed toggle.
  const previewPlan = useMemo(() => generateExamPlan(previewInputs), [previewInputs]);
  const recommendations = useMemo(
    () => (previewInputs.length === 0 ? [] : analyzeExamPeriod(previewPlan, isHe)),
    [previewInputs, previewPlan, isHe],
  );

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleGenerate = () => {
    const exams = examCourses
      .filter((c) => selected[c.code])
      .map((c) => ({ courseCode: c.code, moed: selected[c.code] as Moed }));
    if (exams.length === 0) {
      toast.error(isHe ? "בחר לפחות מבחן אחד" : "Pick at least one exam");
      return;
    }
    generateMutation.mutate({ exams });
  };

  // Tasks grouped by day for the timeline.
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const byDay = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks.slice().sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())) {
      // LOCAL day key (not toISOString/UTC) so an all-day exam stored at local
      // midnight doesn't roll to the previous day for a UTC+2/+3 (Israel) user —
      // and so the checklist agrees with the skyline above it on the exam's day.
      const dt = new Date(t.startDate);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return Array.from(map.entries());
  }, [tasks]);

  // Once the freshly-generated tasks have rendered (the list refetches async
  // over the slow prod DB), scroll the student to the actual plan.
  useEffect(() => {
    if (pendingScroll && tasks.length > 0) {
      scrollToPlan();
      setPendingScroll(false);
    }
  }, [pendingScroll, tasks.length]);

  const toGantt = (): GanttTask[] =>
    tasks.map((t) => ({
      title: t.title,
      courseCode: t.courseCode,
      courseLabel: t.courseCode ? (codeToName.get(t.courseCode) ?? t.title.replace(/^.*?:\s*/, "")) : t.title,
      date: new Date(t.startDate),
      taskType: t.taskType,
      color: t.color,
      hours: t.notes?.includes("h") ? Number((t.notes.match(/([\d.]+)h/) ?? [])[1]) || null : null,
    }));

  // Adapt the SAVED tasks back into an ExamPlanResult so the committed plan
  // renders on the very same skyline as the live preview. Extracted to a pure,
  // round-trip-tested lib (persist-shape → reconstruct).
  const persistedPlan = useMemo<ExamPlanResult>(
    () => planFromStudyTasks(tasks, codeToName),
    [tasks, codeToName],
  );
  const persistedRecs = useMemo(() => analyzeExamPeriod(persistedPlan, isHe), [persistedPlan, isHe]);

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
    toast.success(isHe ? "יוצא ל-ICS — אפשר לייבא ליומן Google" : "Exported ICS — import to Google Calendar");
  };

  // Manual add form.
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addType, setAddType] = useState<"assignment" | "custom" | "study">("assignment");
  const handleAdd = () => {
    if (!addTitle.trim() || !addDate) {
      toast.error(isHe ? "מלא כותרת ותאריך" : "Fill a title and date");
      return;
    }
    const d = new Date(addDate);
    const end = new Date(d);
    end.setHours(23, 59, 0, 0);
    createMutation.mutate({ title: addTitle.trim(), startDate: d, endDate: end, taskType: addType });
    setAddTitle("");
    setAddDate("");
  };

  if (planQuery.isLoading) return <ThemedLoader />;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Header + exports */}
      <div className="animate-stagger-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground/85">
              {isHe ? "תכנון תקופת המבחנים" : "Exam-period planner"}
            </h1>
            <p className="text-xs text-foreground/50">
              {isHe ? "בחר מבחנים ואבנה לך תוכנית לימוד חכמה — אחורה מכל מבחן." : "Pick exams and I'll reverse-plan your study schedule."}
            </p>
          </div>
        </div>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => downloadGanttCsv(toGantt(), isHe)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90">
              <FileSpreadsheet className="size-4" />
              {isHe ? "טבלה לאקסל" : "Excel table"}
            </button>
            <button type="button" onClick={exportIcs} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90">
              <CalendarPlus className="size-4" />
              {isHe ? "ליומן Google" : "To Google Cal"}
            </button>
          </div>
        )}
      </div>

      {/* Miluim exam benefit (2-of-3 sittings) — only for eligible reservists */}
      <MoedBenefitBanner />

      {/* Generate panel */}
      <div className="animate-stagger-2 data-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="size-5 text-accent-brand" />
          <h2 className="font-display text-base font-bold text-foreground/85">{isHe ? "בחר מבחנים" : "Pick exams"}</h2>
          {selectedCount > 0 && <span className="ms-auto text-xs text-foreground/50">{selectedCount} {isHe ? "נבחרו" : "selected"}</span>}
        </div>

        {examCourses.length === 0 ? (
          !hasAnyPlannedCourses ? (
            // No plan at all — guide the (often mid-degree) student to build one.
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-foreground/60">
                {isHe
                  ? "עוד אין לך תכנית לימודים. בנה תכנית קודם — ואז נמשוך משם את תאריכי המבחנים."
                  : "You don't have a study plan yet. Build one first — exam dates come from there."}
              </p>
              <Link
                href="/planner"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
              >
                <GraduationCap className="size-4" />
                {isHe ? "לבניית התכנית" : "Build my plan"}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-foreground/50">
              {isHe
                ? "אין מבחנים קרובים בתכנית שלך. (מבחנים שכבר עברו אינם מוצגים.)"
                : "No upcoming exams in your plan. (Past sittings are hidden.)"}
            </p>
          )
        ) : (
          <div className="space-y-2">
            {examCourses.map((c) => {
              const sel = selected[c.code];
              return (
                <div key={c.code} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2.5", sel ? "border-accent-brand/30 bg-accent-brand/[0.04]" : "border-border/50")}>
                  <button
                    type="button"
                    onClick={() => setSelected((s) => ({ ...s, [c.code]: sel ? undefined : c.examDateA ? "A" : "B" }))}
                    className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors", sel ? "border-accent-brand bg-accent-brand text-accent-brand-fg" : "border-foreground/30")}
                    aria-label="select"
                  >
                    {sel && <Check className="size-3.5" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{c.name}</span>
                  <span className="font-mono text-[10px] text-foreground/40">{c.credits} ש״ס</span>
                  {/* Moed A/B toggle */}
                  <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
                    {(["A", "B"] as Moed[]).map((m) => {
                      const date = m === "A" ? c.examDateA : c.examDateB;
                      const active = sel === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={!date}
                          onClick={() => setSelected((s) => ({ ...s, [c.code]: m }))}
                          className={cn("px-2.5 py-1 transition-colors disabled:opacity-30", active ? "bg-accent-brand text-accent-brand-fg" : "text-foreground/55 hover:bg-foreground/5")}
                          title={date ? date.toLocaleDateString(isHe ? "he-IL" : "en-US") : isHe ? "אין מועד" : "no sitting"}
                        >
                          {isHe ? `מועד ${m === "A" ? "א׳" : "ב׳"}` : `Moed ${m}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={selectedCount === 0 || generateMutation.isPending}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-brand px-4 py-2.5 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
            >
              <Sparkles className="size-4" />
              {generateMutation.isPending ? (isHe ? "בונה תוכנית…" : "Building…") : isHe ? "בנה לי תוכנית לימוד" : "Build my study plan"}
            </button>
          </div>
        )}
      </div>

      {/* Live-preview skyline — the reverse-plan drawn the moment exams are
          picked, updating as the student toggles exams / Moed A↔B, before they
          persist anything. Hidden until at least one exam is selected. */}
      {previewPlan.exams.length > 0 && (
        <div className="animate-fade-in">
          <StudySkyline plan={previewPlan} recommendations={recommendations} isHe={isHe} />
        </div>
      )}

      {/* Plan-is-ready panel (#10) — explicit "what now" so a generated plan
          doesn't perceptually vanish behind a toast. */}
      {genResult && (
        <div role="status" className="animate-fade-in data-card border-emerald-400/30 bg-emerald-400/[0.06] p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-500">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground/85">
                {isHe ? "התוכנית מוכנה!" : "Your plan is ready!"}
              </p>
              <p className="mt-0.5 text-xs text-foreground/60">
                {isHe
                  ? `בנינו לך ${genResult.sessions} מפגשי לימוד עד המבחנים. הנה מה אפשר לעשות עכשיו:`
                  : `We built ${genResult.sessions} study sessions up to your exams. Here's what you can do now:`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={scrollToPlan}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
                >
                  <ArrowDown className="size-4" />
                  {isHe ? "צפו בתוכנית" : "View the plan"}
                </button>
                <button
                  type="button"
                  onClick={() => downloadGanttCsv(toGantt(), isHe)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90"
                >
                  <FileSpreadsheet className="size-4" />
                  {isHe ? "טבלה לאקסל" : "Excel table"}
                </button>
                <button
                  type="button"
                  onClick={exportIcs}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90"
                >
                  <CalendarPlus className="size-4" />
                  {isHe ? "ליומן Google" : "To Google Cal"}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGenResult(null)}
              aria-label={isHe ? "סגור" : "Close"}
              className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:text-foreground/60"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Live recommendations */}
      {recommendations.length > 0 && (
        <div className="animate-stagger-3 data-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-accent-brand" />
            <h3 className="text-sm font-bold text-foreground/85">{isHe ? "המלצות" : "Recommendations"}</h3>
          </div>
          <ul className="space-y-1.5">
            {recommendations.map((r, i) => (
              <li key={i} className={cn("flex items-start gap-2 text-xs leading-relaxed", r.kind === "clash" || r.kind === "deferB" ? "text-amber-600" : "text-foreground/70")}>
                {(r.kind === "clash" || r.kind === "deferB") && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                <span>{isHe ? r.textHe : r.textEn}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Syllabus scanner — exams + deadlines straight from the course PDF */}
      <div className="animate-stagger-3">
        <SyllabusScanner />
      </div>

      {/* Add manual task */}
      <div className="animate-stagger-3 data-card flex flex-wrap items-end gap-2 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label className="text-[11px] text-foreground/50">{isHe ? "הוסף מטלה / משמרת / לימוד" : "Add task / shift / study"}</label>
          <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder={isHe ? "למשל: הגשת עבודה במאקרו" : "e.g. Macro assignment due"} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm focus:border-foreground/30 focus:outline-none" />
        </div>
        <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground/80 focus:border-foreground/30 focus:outline-none" />
        <select value={addType} onChange={(e) => setAddType(e.target.value as typeof addType)} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground/80 focus:outline-none">
          <option value="assignment">{isHe ? "מטלה" : "Assignment"}</option>
          <option value="custom">{isHe ? "אישי/עבודה" : "Personal/work"}</option>
          <option value="study">{isHe ? "לימוד" : "Study"}</option>
        </select>
        <button type="button" onClick={handleAdd} className="inline-flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/15">
          <Plus className="size-4" />
          {isHe ? "הוסף" : "Add"}
        </button>
      </div>

      {/* Committed plan — skyline first, checklist second. Scroll target (#10). */}
      <div ref={timelineRef} aria-hidden className="scroll-mt-4" />
      {tasks.length === 0 ? (
        <div className="animate-stagger-4 rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-8 text-center text-sm text-foreground/45">
          {isHe ? "עוד אין משימות. בחר מבחנים למעלה ולחץ \"בנה לי תוכנית\", או הוסף ידנית." : "No tasks yet. Pick exams above and build a plan, or add manually."}
        </div>
      ) : (
        <div className="animate-stagger-4 space-y-4">
          {/* The saved plan on the skyline (hidden when there are no exam
              anchors — e.g. only manually-added tasks). */}
          {persistedPlan.exams.length > 0 && (
            <StudySkyline plan={persistedPlan} recommendations={persistedRecs} isHe={isHe} />
          )}

          {/* Checklist — mark done / remove. Secondary to the skyline above. */}
          <div className="mb-1 mt-1 flex items-center gap-2">
            <ListChecks className="size-4 text-foreground/40" />
            <h3 className="text-sm font-bold text-foreground/75">{isHe ? "המשימות שלי" : "My tasks"}</h3>
            <span className="text-xs text-foreground/40">{isHe ? "· סמן שהושלם או הסר" : "· check off or remove"}</span>
          </div>
          {byDay.map(([day, dayTasks]) => {
            const [yy, mm, dd] = day.split("-").map(Number);
            const d = new Date(yy!, mm! - 1, dd!);
            return (
              <div key={day} className="data-card p-3">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-sm font-bold text-foreground/80">{d.toLocaleDateString(isHe ? "he-IL" : "en-US", { weekday: "short", day: "numeric", month: "short" })}</span>
                </div>
                <div className="space-y-1.5">
                  {dayTasks.map((t) => {
                    const meta = TYPE_META[t.taskType] ?? TYPE_META.custom!;
                    const Icon = meta.icon;
                    return (
                      <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border/40 p-2" style={{ borderInlineStartWidth: 3, borderInlineStartColor: t.color ?? "var(--border)" }}>
                        <button type="button" onClick={() => toggleMutation.mutate({ id: t.id })} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", t.completed ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25 hover:border-foreground/40")} aria-label="toggle">
                          {t.completed && <Check className="size-3" />}
                        </button>
                        <Icon className="size-3.5 shrink-0 text-foreground/40" />
                        <span className={cn("min-w-0 flex-1 truncate text-sm", t.completed ? "text-foreground/40 line-through" : "text-foreground/80")}>{t.title}</span>
                        <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] text-foreground/50">{isHe ? meta.he : meta.en}</span>
                        <button type="button" onClick={() => deleteMutation.mutate({ id: t.id })} className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-400" aria-label="delete">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
