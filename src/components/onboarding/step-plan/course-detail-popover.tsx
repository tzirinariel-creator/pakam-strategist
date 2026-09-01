"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/components/ui/popover";
import { DISCIPLINE_CONFIG, FILTERABLE_DISCIPLINE_IDS } from "@/lib/constants";
import { courseColor } from "@/lib/course-color";
import { sessionTypeNameFor } from "@/lib/group-options";
import { courseScheduleOutline, isChoice } from "@/lib/course-schedule-outline";
import { heNoun } from "@/lib/he-count";
import { Bidi } from "@/lib/bidi";
import { dayShortFor } from "@/lib/day-of-week";
import { Clock, Calendar, BookOpen, Lock, Users, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { arazimView } from "@/lib/arazim/visibility";
import type { CourseWithSchedule } from "@/lib/plan-generator";

interface CourseDetailPopoverProps {
  course: CourseWithSchedule;
  children: React.ReactNode;
  onDisciplineOverride?: (courseId: string, discipline: string) => void;
}

export function CourseDetailPopover({ course, children, onDisciplineOverride }: CourseDetailPopoverProps) {
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const isHe = locale === "he";
  const cfg = DISCIPLINE_CONFIG[course.discipline];
  const scheduleOutline = courseScheduleOutline(course.scheduleSessions ?? []);
  const [showDisciplineSelect, setShowDisciplineSelect] = useState(false);
  // Arazim gate: hide the external past-grade difficulty row when Arazim is off.
  const av = arazimView(course);
  // examDateA/B are a single global per-course field, overwritten with the last
  // scraped period — so show a sitting ONLY if it's still in the future, and
  // stamp the YEAR, so a stale past date can never read as an upcoming exam for
  // the semester being planned (launch audit 24.7). `now` is seeded once (state
  // initializer) so no impure clock read happens during render.
  const [nowMs] = useState(() => Date.now());
  const { examA, examB } = useMemo(() => {
    const futureOr = (raw: Date | string | null) =>
      raw && new Date(raw).getTime() >= nowMs ? new Date(raw) : null;
    return { examA: futureOr(course.examDateA), examB: futureOr(course.examDateB) };
  }, [course.examDateA, course.examDateB, nowMs]);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 p-4" side="top" sideOffset={8}>
        {/* Close button */}
        <PopoverClose className="absolute top-2 end-2 rounded-md p-1 text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 transition-all">
          <X className="h-3.5 w-3.5" />
        </PopoverClose>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 pe-6">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: courseColor(course.code) }}
            />
            <span className="text-sm font-semibold text-foreground/90 leading-tight">
              {isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-foreground/40">
            <span className="font-mono">{course.code}</span>
            <span>·</span>
            <span>{course.credits} {t("nz")}</span>
            {course.weeklyHours && (
              <>
                <span>·</span>
                {/* weeklyHours is contact-hours-per-week, NOT credits — the ש״ס
                    label here contradicted the real credits shown right beside it. */}
                <span><bdi dir="ltr">{course.weeklyHours}</bdi> {isHe ? "שע׳ שבועיות" : "hrs/wk"}</span>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        {course.description && (
          <p className="text-[11px] leading-relaxed text-foreground/50">
            {course.description}
          </p>
        )}

        {/* Real difficulty data (from past Arazim grades) — helps a student
            decide whether an elective is a smart pick (gal-3 #19). */}
        {(av.difficultyLevel || av.averageGrade != null) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg bg-foreground/[0.03] px-2.5 py-2 text-[11px]">
            {av.difficultyLevel &&
              (() => {
                const meta = {
                  easy: { he: "קל", en: "Easy", cls: "text-emerald-500" },
                  moderate: { he: "בינוני", en: "Moderate", cls: "text-foreground/60" },
                  hard: { he: "קשה", en: "Hard", cls: "text-amber-500" },
                  very_hard: { he: "קשה מאוד", en: "Very hard", cls: "text-red-500" },
                }[av.difficultyLevel as "easy" | "moderate" | "hard" | "very_hard"];
                return meta ? (
                  <span className={cn("font-semibold", meta.cls)}>{isHe ? meta.he : meta.en}</span>
                ) : null;
              })()}
            {/* Golden rule (Q1): never dir="ltr" around a Hebrew word — bdi on
                the NUMBER only (this flipped to "81.07 ממוצע" in the popover). */}
            {av.averageGrade != null && (
              <span className="text-foreground/55">
                {isHe ? "ממוצע " : "avg "}
                <bdi dir="ltr">{av.averageGrade}</bdi>
              </span>
            )}
            {av.failRate != null && av.failRate >= 1 && (
              <span className="text-foreground/55">
                <bdi dir="ltr">{Math.round(av.failRate)}%</bdi> {isHe ? "נכשלים" : "fail"}
              </span>
            )}
            <span className="text-foreground/30">{isHe ? "· מנתוני עבר" : "· from past data"}</span>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {course.isMandatory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 border border-foreground/30 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
              <Lock className="h-2.5 w-2.5" />
              {t("mandatory")}
            </span>
          )}
          {course.attendanceMandatory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 border border-foreground/10 px-2 py-0.5 text-[11px] text-foreground/50">
              <Users className="h-2.5 w-2.5" />
              {t("attendanceRequired")}
            </span>
          )}
          <button
            onClick={() => onDisciplineOverride ? setShowDisciplineSelect((v) => !v) : undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
              onDisciplineOverride && "cursor-pointer hover:opacity-80"
            )}
            style={{
              borderColor: `${cfg?.color ?? "gray"}40`,
              color: cfg?.color ?? "gray",
              backgroundColor: `${cfg?.color ?? "gray"}10`,
            }}
            title={onDisciplineOverride ? (isHe ? "לחצו לשנות שיוך" : "Click to change") : undefined}
          >
            {isHe ? cfg?.nameHe : cfg?.nameEn}
            {onDisciplineOverride && <Pencil className="inline h-2.5 w-2.5 opacity-40" />}
          </button>
          {course.submissionType !== "NONE" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 border border-foreground/10 px-2 py-0.5 text-[11px] text-foreground/50">
              <BookOpen className="h-2.5 w-2.5" />
              {course.submissionType === "EXAM" ? t("exam") : course.submissionType === "PAPER" ? t("paper") : t("referat")}
            </span>
          )}
          {/* Discipline override selector */}
          {showDisciplineSelect && onDisciplineOverride && (
            <div className="mt-1.5 flex flex-wrap gap-1 animate-in fade-in duration-150">
              {FILTERABLE_DISCIPLINE_IDS
                .map((key) => {
                  const d = DISCIPLINE_CONFIG[key];
                  if (!d) return null;
                  const isActive = course.discipline === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        onDisciplineOverride(course.id, key);
                        setShowDisciplineSelect(false);
                      }}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition-all",
                        isActive
                          ? "font-medium"
                          : "opacity-60 hover:opacity-100"
                      )}
                      style={{
                        borderColor: `${d.color}40`,
                        color: d.color,
                        backgroundColor: isActive ? `${d.color}20` : `${d.color}08`,
                      }}
                    >
                      {isHe ? d.nameHe : d.nameEn}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Schedule — grouped, because these rows are ALTERNATIVES.
            22-6: "מה שאין: תת-תפריט של רצועות-זמן בהוספת קורס."

            This mapped `scheduleSessions` straight to rows — the identical
            defect 22-5 described on the catalog modal, where אקונומטריקה
            יישומית came out as twenty near-identical lines and read as "this
            course eats my whole week". That was fixed there with
            `courseScheduleOutline` and never carried across to HERE, which is
            the popover a student actually opens while choosing what to bid on.
            Same helper, so the two screens can no longer disagree about what a
            course costs you. */}
        {scheduleOutline.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-foreground/40 uppercase tracking-wider">
              {t("schedule")}
            </div>
            {scheduleOutline.map((section) => (
              <div key={section.sessionType}>
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-[11px] font-medium text-foreground/55">
                    {sessionTypeNameFor(section.sessionType, isHe)}
                  </span>
                  {isChoice(section) && (
                    <span className="text-[10px] text-foreground/40">
                      {isHe
                        ? `${heNoun(section.groups.length, "קבוצה", "קבוצות")} — בוחרים אחת`
                        : `${section.groups.length} groups — pick one`}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {section.groups.map((g, gi) => (
                    <div key={g.groupCode ?? gi} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/60">
                      <Clock className="h-3 w-3 shrink-0 text-foreground/30" />
                      {g.groupCode && (
                        <span className="shrink-0 rounded bg-foreground/[0.06] px-1.5 py-px text-[10px] font-medium text-foreground/55">
                          <Bidi text={isHe ? `קבוצה ${g.groupCode}` : `Group ${g.groupCode}`} />
                        </span>
                      )}
                      {g.meetings.map((m, mi) => (
                        <span key={mi} className="flex items-center gap-1">
                          <span className="font-medium">{dayShortFor(m.dayOfWeek, isHe)}</span>
                          <span dir="ltr" className="font-mono text-[10px]">{m.startTime}–{m.endTime}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Exam dates — future sittings only, year-stamped */}
        {(examA || examB) && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-foreground/40 uppercase tracking-wider">
              {t("examDates")}
            </div>
            <div className="flex gap-3 text-xs text-foreground/60">
              {examA && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-red-400/60" />
                  <span>{isHe ? "א׳:" : "A:"}</span>
                  <span className="font-mono text-[10px]">
                    {examA.toLocaleDateString(isHe ? "he-IL" : "en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                </div>
              )}
              {examB && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-amber-400/60" />
                  <span>{isHe ? "ב׳:" : "B:"}</span>
                  <span className="font-mono text-[10px]">
                    {examB.toLocaleDateString(isHe ? "he-IL" : "en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prerequisites */}
        {course.prerequisites.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-foreground/40 uppercase tracking-wider">
              {t("prerequisites")}
            </div>
            <div className="flex flex-wrap gap-1">
              {course.prerequisites.map((code) => (
                <span
                  key={code}
                  className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/50"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
