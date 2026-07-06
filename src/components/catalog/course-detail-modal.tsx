"use client";

import { useLocale } from "next-intl";
import { Clock, Calendar, ArrowLeftRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { AskKingButton } from "@/components/ui/ask-king-button";
import type { Course } from "@/types/degree";
import type { Discipline } from "@/types/enums";

const DIFFICULTY_META: Record<string, { he: string; en: string; cls: string }> = {
  easy: { he: "קל", en: "Easy", cls: "text-emerald-500" },
  moderate: { he: "בינוני", en: "Moderate", cls: "text-foreground/60" },
  hard: { he: "קשה", en: "Hard", cls: "text-amber-500" },
  very_hard: { he: "קשה מאוד", en: "Very hard", cls: "text-red-500" },
};

const DAY_LABELS_HE: Record<string, string> = { SUNDAY: "א׳", MONDAY: "ב׳", TUESDAY: "ג׳", WEDNESDAY: "ד׳", THURSDAY: "ה׳" };
const DAY_LABELS_EN: Record<string, string> = { SUNDAY: "Sun", MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu" };

function formatGradeYear(raw: string | null, isHe: boolean): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\s*([abc])?$/i);
  if (!m) return null;
  const sem = (m[2] ?? "").toLowerCase();
  const he = sem === "a" ? "א׳ " : sem === "b" ? "ב׳ " : sem === "c" ? "קיץ " : "";
  const en = sem === "a" ? "Fall " : sem === "b" ? "Spring " : sem === "c" ? "Summer " : "";
  return isHe ? `${he}${m[1]}` : `${en}${m[1]}`;
}

/**
 * Course detail — the "real course view", not just a row. Opens as a Radix
 * Dialog (portal, so it's immune to the transform-ancestor overflow gotcha),
 * with prerequisites resolved to NAMES you can click to jump to, and an HONEST
 * grade block that says out loud these numbers are a historical estimate.
 */
export function CourseDetailModal({
  course,
  courses,
  onOpenCourse,
  onClose,
}: {
  course: Course | null;
  courses: Course[];
  onOpenCourse: (c: Course) => void;
  onClose: () => void;
}) {
  const isHe = useLocale() === "he";
  if (!course) return null;

  const cfg = DISCIPLINE_CONFIG[course.discipline as Discipline];
  const name = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
  const diff = course.difficultyLevel ? DIFFICULTY_META[course.difficultyLevel] : null;
  const fromYear = formatGradeYear(course.gradeDataYear, isHe);
  const dayLabels = isHe ? DAY_LABELS_HE : DAY_LABELS_EN;
  const sessions = course.scheduleSessions ?? [];
  const byCode = (code: string) => courses.find((c) => c.code === code) ?? null;
  const hasGrade = course.averageGrade != null || course.medianGrade != null || (course.failRate != null && course.failRate >= 1);

  return (
    <Dialog open={!!course} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-2.5 pe-6">
            <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cfg?.color ?? "gray" }} />
            <div className="min-w-0">
              <DialogTitle className="text-start text-base font-bold leading-snug">{name}</DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/50">
                <Bidi text={course.code} />
                <span>·</span>
                <span>{course.credits} {isHe ? "ש״ס" : "cr."}</span>
                {cfg && (
                  <>
                    <span>·</span>
                    <span style={{ color: cfg.color }}>{isHe ? cfg.nameHe : cfg.nameEn}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-1">
          {/* Honest grade block */}
          {hasGrade ? (
            <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {course.averageGrade != null && (
                  <Stat label={isHe ? "ממוצע" : "Average"} value={course.averageGrade.toFixed(1)} />
                )}
                {course.medianGrade != null && (
                  <Stat label={isHe ? "חציון" : "Median"} value={course.medianGrade.toFixed(1)} />
                )}
                {course.failRate != null && course.failRate >= 1 && (
                  <Stat label={isHe ? "נכשלים" : "Fail rate"} value={`${Math.round(course.failRate)}%`} />
                )}
                {diff && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-foreground/40">{isHe ? "קושי (הערכה)" : "Difficulty (est.)"}</span>
                    <span className={cn("font-bold", diff.cls)}>{isHe ? diff.he : diff.en}</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-foreground/45">
                {isHe
                  ? `רמת הקושי מחושבת מהממוצע, החציון ואחוז-הנכשלים — הערכה מנתוני עבר${fromYear ? ` (${fromYear})` : ""}, לא ציון רשמי של האוניברסיטה.`
                  : `Difficulty is derived from the average, median and fail-rate — an estimate from historical data${fromYear ? ` (${fromYear})` : ""}, not an official university figure.`}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-3 text-xs text-foreground/45">
              {isHe ? "אין נתוני ציונים היסטוריים לקורס הזה (שכיח בקורסי משפט וסמינרים)." : "No historical grade data for this course (common for Law courses and seminars)."}
            </p>
          )}

          {/* Schedule */}
          {sessions.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-foreground/40">{isHe ? "מערכת שעות" : "Schedule"}</div>
              <div className="flex flex-col gap-1">
                {sessions.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground/60">
                    <Clock className="size-3 text-foreground/30" />
                    <span className="font-medium">{dayLabels[s.dayOfWeek] ?? s.dayOfWeek}</span>
                    <span dir="ltr" className="font-mono text-[10px]">{s.startTime}–{s.endTime}</span>
                    <span className="text-[10px] text-foreground/35">
                      {s.sessionType === "lecture" ? (isHe ? "הרצאה" : "Lecture") : s.sessionType === "tutorial" ? (isHe ? "תרגול" : "Tutorial") : s.sessionType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exam dates */}
          {(course.examDateA || course.examDateB) && (
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-foreground/40">{isHe ? "מועדי בחינה" : "Exam dates"}</div>
              <div className="flex gap-4 text-xs text-foreground/60">
                {course.examDateA && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3 text-red-400/60" />
                    {isHe ? "מועד א׳:" : "A:"} <span className="font-mono text-[10px]" dir="ltr">{new Date(course.examDateA).toLocaleDateString(isHe ? "he-IL" : "en-GB", { day: "2-digit", month: "2-digit" })}</span>
                  </span>
                )}
                {course.examDateB && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3 text-amber-400/60" />
                    {isHe ? "מועד ב׳:" : "B:"} <span className="font-mono text-[10px]" dir="ltr">{new Date(course.examDateB).toLocaleDateString(isHe ? "he-IL" : "en-GB", { day: "2-digit", month: "2-digit" })}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Prerequisites — as NAMES, clickable to jump to that course */}
          {course.prerequisites.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-foreground/40">{isHe ? "דרישות קדם" : "Prerequisites"}</div>
              <div className="flex flex-wrap gap-1.5">
                {course.prerequisites.map((code) => {
                  const pre = byCode(code);
                  return pre ? (
                    <button
                      key={code}
                      type="button"
                      onClick={() => onOpenCourse(pre)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-foreground/[0.02] px-2 py-1 text-xs text-foreground/75 transition-colors hover:border-accent-brand/40 hover:text-foreground/90"
                    >
                      <ArrowLeftRight className="size-3 text-foreground/35" />
                      {isHe ? pre.nameHe : (pre.nameEn ?? pre.nameHe)}
                    </button>
                  ) : (
                    <span key={code} className="rounded-lg bg-foreground/5 px-2 py-1 font-mono text-[10px] text-foreground/50">
                      <Bidi text={code} />
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ask the King about this course */}
          <AskKingButton
            promptHe={`ספר לי על "${course.nameHe}" (${course.code}) — כמה הוא קשה, ואיך הוא משתלב לי בתואר?`}
            promptEn={`Tell me about "${course.nameEn ?? course.nameHe}" (${course.code}) — how hard is it, and how does it fit my degree?`}
            labelHe="שאל את המלך על הקורס הזה"
            labelEn="Ask the King about this course"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-accent-brand/10 px-2.5 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/20"
            iconClassName="size-3.5"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-foreground/40">{label}</span>
      <span className="font-mono text-lg font-bold tabular-nums text-foreground/85" dir="ltr">{value}</span>
    </div>
  );
}
