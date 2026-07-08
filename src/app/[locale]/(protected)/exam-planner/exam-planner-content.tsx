"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarRange,
  ListChecks,
  Lightbulb,
  Plus,
  Trash2,
  Check,
  GraduationCap,
  BookOpen,
  Briefcase,
  AlertTriangle,
  ChevronDown,
  Clock,
  Share2,
  FileSpreadsheet,
  CalendarPlus,
} from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { AskKingButton } from "@/components/ui/ask-king-button";
import {
  generateExamPlan,
  analyzeExamPeriod,
  recommendMoed,
  type ExamInput,
  type ExamPlanResult,
} from "@/lib/exam-planner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudySkyline } from "@/components/exam-planner/study-skyline";
import { SyllabusScanner } from "@/components/exam-planner/syllabus-scanner";
import { MoedBenefitBanner } from "@/components/exam-planner/moed-benefit-banner";
import { ExamPlanWizard, MoedPrinciplesCard, type PrepStyle } from "@/components/exam-planner/exam-plan-wizard";
import { planFromStudyTasks } from "@/lib/plan-from-tasks";
import { downloadGanttCsv, type GanttTask } from "@/lib/excel-export";
import { cn } from "@/lib/utils";

type Moed = "A" | "B";
type StudyTask = { id: string; title: string; startDate: string | Date; endDate: string | Date; taskType: string; courseCode: string | null; color: string | null; notes: string | null; completed: boolean };

const TYPE_META: Record<string, { he: string; en: string; icon: React.ComponentType<{ className?: string }> }> = {
  exam: { he: "מבחן", en: "Exam", icon: GraduationCap },
  study: { he: "לימוד", en: "Study", icon: BookOpen },
  assignment: { he: "מטלה", en: "Assignment", icon: BookOpen },
  custom: { he: "אישי", en: "Personal", icon: Briefcase },
};

/** Hours a study session is worth — stored in `notes` as "2.5h" by the planner. */
function taskHours(t: StudyTask): number | null {
  if (!t.notes) return null;
  const m = t.notes.match(/([\d.]+)h/);
  return m ? Number(m[1]) || null : null;
}

/** Local YYYY-MM-DD key (never UTC) so an all-day exam at local midnight doesn't
 *  roll to the previous day for an Israel (UTC+2/+3) user. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    onError: () => toast.error(isHe ? "יצירת התוכנית נכשלה" : "Failed to generate plan"),
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
    return out;
  }, [planQuery.data]);

  const hasAnyPlannedCourses = (planQuery.data?.courses?.length ?? 0) > 0;

  const [selected, setSelected] = useState<Record<string, Moed | undefined>>({});
  // Skyline→agenda link (#37); n bumps so re-clicking the same day re-scrolls.
  const [focusDay, setFocusDay] = useState<{ key: string; n: number } | null>(null);
  // Wizard tuning (#37) — prep style + blocked days feed the preview and the
  // generate call. blockedDays are the engine's already-supported `unavailable`.
  const [prepStyle, setPrepStyle] = useState<PrepStyle>("steady");
  const [blockedDays, setBlockedDays] = useState<string[]>([]);
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
      inputs.push({ courseCode: c.code, courseName: c.name, examDate: date, credits, averageGrade: c.averageGrade, failRate: c.failRate, moed });
    }
    return inputs;
  }, [examCourses, selected, prepStyle]);

  const previewPlan = useMemo(() => generateExamPlan(previewInputs, new Date(), blockedDays), [previewInputs, blockedDays]);
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
    generateMutation.mutate({ exams, unavailable: blockedDays.length > 0 ? blockedDays : undefined });
    setRetuneOpen(false);
  };

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
  const handleAdd = () => {
    if (!addTitle.trim() || !addDate) {
      toast.error(isHe ? "מלאו כותרת ותאריך" : "Fill a title and date");
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
          {examCourses.map((c) => {
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
                      <button key={m} type="button" disabled={!date} onClick={() => setSelected((s) => ({ ...s, [c.code]: m }))} className={cn("flex flex-col items-center px-2.5 py-1 transition-colors disabled:opacity-30", active ? "bg-accent-brand text-accent-brand-fg" : "text-foreground/55 hover:bg-foreground/5")}>
                        <span className="flex items-center gap-1 leading-tight">
                          {isHe ? `מועד ${m === "A" ? "א׳" : "ב׳"}` : `Moed ${m}`}
                          {isRec && !active && (
                            <span className="rounded-full bg-accent-brand/10 px-1 text-[11px] font-semibold text-accent-brand">
                              {isHe ? "מומלץ" : "rec."}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums leading-tight opacity-80" dir="ltr">
                          {date ? `${date.getDate()}.${date.getMonth() + 1}` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button type="button" onClick={handleGenerate} disabled={selectedCount === 0 || generateMutation.isPending} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-brand px-4 py-2.5 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40">
            <CalendarRange className="size-4" />
            {generateMutation.isPending ? (isHe ? "בונה תוכנית…" : "Building…") : hasPlan ? (isHe ? "עדכן את התוכנית" : "Update the plan") : isHe ? "בנה לי תוכנית לימוד" : "Build my study plan"}
          </button>
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
              className="ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-brand/85 transition-colors hover:bg-accent-brand/10 hover:text-accent-brand"
              iconClassName="size-3"
            />
          )}
        </div>
        <ul className="space-y-1.5">
          {recs.map((r, i) => (
            <li key={i} className={cn("flex items-start gap-2 text-xs leading-relaxed", r.kind === "clash" || r.kind === "deferB" ? "text-amber-600" : "text-foreground/70")}>
              {(r.kind === "clash" || r.kind === "deferB") && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
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
        {hasPlan && <ShareMenu isHe={isHe} onIcs={exportIcs} onCsv={() => downloadGanttCsv(toGantt(), isHe)} />}
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
                  onFinish={handleGenerate}
                  finishBusy={generateMutation.isPending}
                  finishLabel={generateMutation.isPending ? (isHe ? "מעדכן…" : "Updating…") : isHe ? "עדכן את התוכנית" : "Update the plan"}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRetuneOpen(true)}
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

// ── Share menu — Radix DropdownMenu (portal), so a transformed/stacking
// ancestor can never trap it under sibling cards again (#34). ICS primary,
// CSV secondary; RTL comes from the RadixDirection provider.
function ShareMenu({ isHe, onIcs, onCsv }: { isHe: boolean; onIcs: () => void; onCsv: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90">
        <Share2 className="size-4" />
        {isHe ? "שיתוף / ייצוא" : "Share / export"}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuItem onSelect={onIcs} className="gap-2 text-sm text-foreground/80">
          <CalendarPlus className="size-4 text-accent-brand" />
          {isHe ? "הוסיפו ליומן Google" : "Add to Google Calendar"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCsv} className="gap-2 text-xs text-foreground/55">
          <FileSpreadsheet className="size-3.5" />
          {isHe ? "הורד טבלה (CSV)" : "Download table (CSV)"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Disclosure — collapsed secondary tools so they don't shout on first load ──
function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="animate-stagger-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-2.5 text-sm font-medium text-foreground/65 transition-colors hover:bg-foreground/[0.04]">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {title}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ── Agenda — TODAY-first, hours-aware, with inline done / push / remove ──
function Agenda({
  byDay,
  isHe,
  onToggle,
  onDelete,
  onPush,
  onPushDay,
  courses,
  onQuickAdd,
  focusDay,
}: {
  byDay: [string, StudyTask[]][];
  isHe: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPush: (t: StudyTask) => void;
  onPushDay: (list: StudyTask[]) => void;
  courses: { code: string; name: string; color: string | null }[];
  onQuickAdd: (dayKey: string, course: { code: string; name: string; color: string | null }) => void;
  /** Skyline day-click target — n bumps so re-clicking the same day re-scrolls. */
  focusDay: { key: string; n: number } | null;
}) {
  const [showTail, setShowTail] = useState(false);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const todayKey = dayKey(new Date());
  // Only future/today days (a past auto-generated session is noise once it's gone).
  const upcoming = byDay.filter(([k]) => k >= todayKey);

  // Skyline day-click (#37): open the tail if needed, scroll to the day card,
  // flash a ring for 2s. Runs before the empty-state return (hooks order).
  useEffect(() => {
    if (!focusDay) return;
    const inTail = upcoming.slice(3).some(([k]) => k === focusDay.key);
    if (inTail) setShowTail(true);
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`agenda-day-${focusDay.key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setHighlight(focusDay.key);
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per click (n bump), not on list churn
  }, [focusDay]);

  if (upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-8 text-center text-sm text-foreground/45">
        {isHe ? "אין משימות קרובות. הוסף מבחנים כדי לבנות תוכנית." : "No upcoming tasks. Add exams to build a plan."}
      </div>
    );
  }
  const head = upcoming.slice(0, 3);
  const tail = upcoming.slice(3);

  const dayTotal = (list: StudyTask[]) => list.reduce((s, t) => s + (taskHours(t) ?? 0), 0);

  const renderDay = (key: string, list: StudyTask[], isToday: boolean) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    const d = new Date(yy!, mm! - 1, dd!);
    const hours = dayTotal(list);
    const hasMovable = list.some((t) => t.taskType !== "exam" && !t.completed);
    // Load tint echoes the skyline thresholds (2.5 / 5h).
    const loadColor = hours >= 5 ? "bg-red-400/70" : hours >= 2.5 ? "bg-amber-400/70" : "bg-emerald-400/70";
    return (
      <div
        key={key}
        id={`agenda-day-${key}`}
        className={cn(
          "data-card p-3.5",
          isToday && "border-accent-brand/40 ring-1 ring-accent-brand/20",
          highlight === key && "ring-2 ring-accent-brand/40",
        )}
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-bold", isToday ? "text-accent-brand" : "text-foreground/80")}>
            {isToday ? (isHe ? "היום" : "Today") : d.toLocaleDateString(isHe ? "he-IL" : "en-US", { weekday: "long", day: "numeric", month: "short" })}
          </span>
          {isToday && <span className="text-[11px] text-foreground/45">{d.toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short" })}</span>}
          {hours > 0 && (
            <span className="ms-auto flex items-center gap-1.5">
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10">
                <span className={cn("block h-full rounded-full", loadColor)} style={{ width: `${Math.min((hours / 6) * 100, 100)}%` }} />
              </span>
              <span className="font-mono text-[11px] tabular-nums text-foreground/60" dir="ltr">
                <Clock className="mb-0.5 me-0.5 inline size-3" />{hours} {isHe ? "שע׳" : "h"}
              </span>
            </span>
          )}
          <span className={cn("flex items-center gap-1", hours === 0 && "ms-auto")}>
            {courses.length > 0 && (
              <button
                type="button"
                onClick={() => setAddingDay((a) => (a === key ? null : key))}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground/45 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                {isHe ? "+ לימוד" : "+ study"}
              </button>
            )}
            {hasMovable && (
              <button
                type="button"
                onClick={() => onPushDay(list)}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground/45 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                {isHe ? "דחו יום" : "Push day"}
              </button>
            )}
          </span>
        </div>
        {addingDay === key && courses.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {courses.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onQuickAdd(key, c);
                  setAddingDay(null);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border/50 px-2 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: c.color ?? "var(--accent-brand)" }} />
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {list.map((t) => {
            const meta = TYPE_META[t.taskType] ?? TYPE_META.custom!;
            const Icon = meta.icon;
            const h = taskHours(t);
            const isExam = t.taskType === "exam";
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border/40 p-2" style={{ borderInlineStartWidth: 3, borderInlineStartColor: t.color ?? "var(--border)" }}>
                {!isExam && (
                  <button type="button" onClick={() => onToggle(t.id)} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", t.completed ? "border-emerald-400 bg-emerald-400 text-white" : "border-foreground/25 hover:border-foreground/40")} aria-label={isHe ? "סמנו שהושלם" : "toggle done"}>
                    {t.completed && <Check className="size-3" />}
                  </button>
                )}
                <Icon className={cn("size-3.5 shrink-0", isExam ? "text-accent-brand" : "text-foreground/40")} />
                <span className={cn("min-w-0 flex-1 truncate text-sm", t.completed ? "text-foreground/40 line-through" : "text-foreground/80")}>{t.title}</span>
                {h != null && <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/45" dir="ltr">{h}{isHe ? "שע׳" : "h"}</span>}
                <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] text-foreground/50">{isHe ? meta.he : meta.en}</span>
                {!isExam && (
                  <button type="button" onClick={() => onPush(t)} className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:bg-foreground/10 hover:text-foreground/60" title={isHe ? "דחו ביום" : "Push a day"} aria-label={isHe ? "דחו ביום" : "push a day"}>
                    <span className="text-xs font-bold">+1</span>
                  </button>
                )}
                <button type="button" onClick={() => onDelete(t.id)} className="shrink-0 rounded-md p-1 text-foreground/30 transition-colors hover:bg-red-500/10 hover:text-red-400" aria-label={isHe ? "הסר" : "delete"}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-stagger-3 flex flex-col gap-3">
      {head.map(([key, list]) => renderDay(key, list, key === todayKey))}
      {tail.length > 0 && (
        <>
          {showTail && tail.map(([key, list]) => renderDay(key, list, false))}
          <button type="button" onClick={() => setShowTail((s) => !s)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-2 text-xs font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.04]">
            <ChevronDown className={cn("size-3.5 transition-transform", showTail && "rotate-180")} />
            {showTail ? (isHe ? "הסתר" : "Hide") : isHe ? `שאר התוכנית (${tail.length} ימים)` : `Rest of the plan (${tail.length} days)`}
          </button>
        </>
      )}
    </div>
  );
}
