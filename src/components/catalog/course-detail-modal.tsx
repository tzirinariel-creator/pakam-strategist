"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { Clock, Calendar, ArrowLeftRight, Flag, MessageSquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import { courseColor } from "@/lib/course-color";
import { sessionTypeNameFor } from "@/lib/group-options";
import { courseScheduleOutline, isChoice } from "@/lib/course-schedule-outline";
import { heNoun } from "@/lib/he-count";
import { dayShortFor } from "@/lib/day-of-week";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { AskAdvisorButton } from "@/components/ui/ask-advisor-button";
import { api } from "@/lib/trpc/react";
import { TAG_LABELS, isAllowedTag } from "@/lib/course-knowledge-tags";
import { ContributeReviewSheet } from "./contribute-review-sheet";
import { arazimView } from "@/lib/arazim/visibility";
import type { Course } from "@/types/degree";
import type { Discipline } from "@/types/enums";

const DIFFICULTY_META: Record<string, { he: string; en: string; cls: string }> = {
  easy: { he: "קל", en: "Easy", cls: "text-emerald-500" },
  moderate: { he: "בינוני", en: "Moderate", cls: "text-foreground/60" },
  hard: { he: "קשה", en: "Hard", cls: "text-amber-500" },
  very_hard: { he: "קשה מאוד", en: "Very hard", cls: "text-red-500" },
};

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
  const [contributeOpen, setContributeOpen] = useState(false);
  if (!course) return null;

  const cfg = DISCIPLINE_CONFIG[course.discipline as Discipline];
  const name = isHe ? course.nameHe : (course.nameEn ?? course.nameHe);
  // Arazim gate: hide the external historical grade/difficulty block when
  // Arazim is off ("בלי ארזים כרגע") — the modal then shows its honest
  // "no historical grade data" line and keeps the community/cohort block below.
  const av = arazimView(course);
  const diff = av.difficultyLevel ? DIFFICULTY_META[av.difficultyLevel as keyof typeof DIFFICULTY_META] : null;
  const fromYear = formatGradeYear(av.gradeDataYear, isHe);
  const sessions = course.scheduleSessions ?? [];
  const scheduleOutline = courseScheduleOutline(sessions);
  const byCode = (code: string) => courses.find((c) => c.code === code) ?? null;
  const hasGrade = av.averageGrade != null || av.medianGrade != null || (av.failRate != null && av.failRate >= 1);

  return (
    <Dialog open={!!course} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-2.5 pe-6">
            <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: courseColor(course.code) }} />
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
                {av.averageGrade != null && (
                  <Stat label={isHe ? "ממוצע" : "Average"} value={av.averageGrade.toFixed(1)} />
                )}
                {av.medianGrade != null && (
                  <Stat label={isHe ? "חציון" : "Median"} value={av.medianGrade.toFixed(1)} />
                )}
                {av.failRate != null && av.failRate >= 1 && (
                  <Stat label={isHe ? "נכשלים" : "Fail rate"} value={`${Math.round(av.failRate)}%`} />
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
                  ? `הנתונים מפרויקט ארזים — סטטיסטיקות ציונים אמיתיות של סטודנטים משנים קודמות${fromYear ? ` (${fromYear})` : ""}. רמת הקושי מחושבת מהממוצע, החציון ואחוז-הנכשלים. לא נתון רשמי של האוניברסיטה.`
                  : `Data from the Arazim project — real student grade statistics from past years${fromYear ? ` (${fromYear})` : ""}. Difficulty is derived from the average, median and fail-rate. Not an official university figure.`}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-3 text-xs text-foreground/45">
              {isHe ? "אין נתוני ציונים היסטוריים לקורס הזה (שכיח בקורסי משפט וסמינרים)." : "No historical grade data for this course (common for Law courses and seminars)."}
            </p>
          )}

          {/* Cross-cohort community knowledge (#3/#16). A SEPARATE source from
              the Arazim historical block above — two sources, never merged.
              Degrades gracefully: if the backing tables don't exist yet the
              query errors and we simply render nothing (no crash). */}
          <CommunityKnowledge
            course={course}
            isHe={isHe}
            onContribute={() => setContributeOpen(true)}
          />

          <ContributeReviewSheet
            courseCode={course.code}
            courseName={isHe ? course.nameHe : (course.nameEn ?? course.nameHe)}
            open={contributeOpen}
            onClose={() => setContributeOpen(false)}
          />

          {/* Schedule — Ariel, 22.8: "מה זה החלון לוז המטורף הזה שקופץ כשלחצתי
              על אקונומטריקה?". This used to map `sessions` straight to rows, so
              a course with three lecture groups and eight tutorial groups came
              out as twenty near-identical lines with nothing saying which group
              each belonged to. Read as a schedule rather than as a menu, it
              says "this course eats your whole week" — which is false, and
              false in the direction that changes what someone bids on.
              Grouped by type, then by group, with the choice stated. */}
          {scheduleOutline.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-foreground/40">{isHe ? "מערכת שעות" : "Schedule"}</div>
              <div className="flex flex-col gap-2.5">
                {scheduleOutline.map((section) => (
                  <div key={section.sessionType}>
                    <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                      <span className="font-semibold text-foreground/70">
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
                    <div className="mt-1 flex flex-col gap-1">
                      {section.groups.map((g, gi) => (
                        <div
                          key={g.groupCode ?? gi}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/60"
                        >
                          <Clock className="size-3 shrink-0 text-foreground/30" />
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
                    {isHe ? "מועד א׳:" : "A:"} <span className="font-mono text-[10px]" dir="ltr">{new Date(course.examDateA).toLocaleDateString(isHe ? "he-IL" : "en-GB", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</span>
                  </span>
                )}
                {course.examDateB && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3 text-amber-400/60" />
                    {isHe ? "מועד ב׳:" : "B:"} <span className="font-mono text-[10px]" dir="ltr">{new Date(course.examDateB).toLocaleDateString(isHe ? "he-IL" : "en-GB", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</span>
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
          <AskAdvisorButton
            promptHe={`ספר לי על "${course.nameHe}" (${course.code}) — כמה הוא קשה, ואיך הוא משתלב לי בתואר?`}
            promptEn={`Tell me about "${course.nameEn ?? course.nameHe}" (${course.code}) — how hard is it, and how does it fit my degree?`}
            labelHe="שאל את {advisor} על הקורס הזה"
            labelEn="Ask {advisor} about this course"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-accent-brand/10 px-2.5 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/20"
            iconClassName="size-3.5"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cross-cohort community knowledge (#3/#16)
// ---------------------------------------------------------------------------

// The reading half of 22-18. Fixing only the QUESTION would have left the
// ANSWER rendering as "הייתי מדלג" on a required course — which is the version
// that actually reaches other students, and the one that does harm. Same enum,
// same colour, wording that matches what a person can do about it.
const VERDICT_META: Record<string, { he: string; heRequired?: string; en: string; enRequired?: string; cls: string }> = {
  RECOMMEND: { he: "שווה", en: "Worth it", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  NEUTRAL: { he: "ניטרלי", en: "Neutral", cls: "bg-foreground/10 text-foreground/70" },
  AVOID: { he: "הייתי מדלג", heRequired: "לא נתן לי הרבה", en: "Would skip", enRequired: "Gave me little", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

/** The label to print for a stored verdict, given whether the course is required. */
function verdictLabel(vm: (typeof VERDICT_META)[string], isHe: boolean, required: boolean) {
  return isHe ? (required && vm.heRequired) || vm.he : (required && vm.enRequired) || vm.en;
}

/** 1–5 average rendered as filled/empty dots (rounded to nearest). */
function Dots({ value }: { value: number | null }) {
  const filled = value == null ? 0 : Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" dir="ltr" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn("size-1.5 rounded-full", n <= filled ? "bg-accent-brand" : "bg-foreground/15")}
        />
      ))}
    </span>
  );
}

function CommunityKnowledge({
  course,
  isHe,
  onContribute,
}: {
  course: Course;
  isHe: boolean;
  onContribute: () => void;
}) {
  // Public read. `retry:false` so a missing-table error (migration pending)
  // fails fast and we render the empty invitation rather than crashing.
  const q = api.courseKnowledge.getForCourse.useQuery(
    { courseCode: course.code },
    { retry: false, staleTime: 60_000 }
  );

  const utils = api.useUtils();
  const report = api.courseKnowledge.reportReview.useMutation({
    onSuccess: () => {
      void utils.courseKnowledge.getForCourse.invalidate({ courseCode: course.code });
      toast.success(isHe ? "תודה — נבדוק את זה." : "Thanks — we'll review it.");
    },
    onError: () => advisorError(isHe ? "הדיווח לא נשלח — נסו שוב." : "Report failed. Try again."),
  });

  const data = q.data;
  const errored = q.isError;

  // Graceful degrade: still loading, or the backing tables don't exist yet.
  if (q.isLoading) {
    return (
      <div className="h-16 animate-pulse rounded-xl border border-border/40 bg-foreground/[0.02]" aria-hidden />
    );
  }

  const ratings = data?.ratings;
  const grade = data?.grade;
  const reviews = data?.reviews ?? [];
  // Ariel's "ציון מנהלים מול קהילה": the app's own note, kept out of every
  // community figure and labelled as coming from Pakamon rather than from the
  // cohort. Rendered even when there is no community data at all — it is not
  // a crowd statistic and does not wait for a crowd.
  const official = data?.official ?? null;

  const hasAnything =
    !!data &&
    ((ratings?.revealed ?? false) ||
      (grade?.revealed ?? false) ||
      (grade?.nGraded ?? 0) > 0 ||
      (ratings?.n ?? 0) > 0 ||
      reviews.length > 0 ||
      !!official);

  // Total app-community sample size for the header.
  const communityN = Math.max(grade?.n ?? 0, ratings?.n ?? 0, reviews.length);

  const officialBlock = official ? (
    <div className="rounded-xl border border-accent-brand/30 bg-accent-brand/[0.06] p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-accent-brand">
          {isHe ? "מפכמון" : "From Pakamon"}
        </span>
        <span className="text-[10px] text-foreground/40">
          {isHe ? "· לא ממוצע של המחזור" : "· not a cohort average"}
        </span>
      </div>
      {official.tip && (
        <p className="text-xs leading-relaxed text-foreground/75">{official.tip}</p>
      )}
      {official.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {official.tags.map((tg) => (
            <span key={tg} className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] text-foreground/60">
              {tg}
            </span>
          ))}
        </div>
      )}
    </div>
  ) : null;

  // Empty / errored: a single honest invitation, no empty numbers.
  if (errored || !hasAnything) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-3">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-foreground/40">
          {isHe ? "מהסטודנטים באפליקציה" : "From students in the app"}
        </div>
        <p className="text-xs leading-relaxed text-foreground/55">
          {isHe
            ? "עדיין אין מידע קהילתי לקורס הזה. למדתם אותו? היו הראשונים לעזור למחזור הבא."
            : "No community info for this course yet. Took it? Be the first to help the next cohort."}
        </p>
        <button
          type="button"
          onClick={onContribute}
          className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent-brand/10 px-2.5 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/20"
        >
          <MessageSquarePlus className="size-3.5" />
          {isHe ? "דרגו את הקורס" : "Rate this course"}
        </button>
      </div>
    );
  }

  const binaryHigh = grade?.binaryShare != null && grade.binaryShare >= 0.25;

  return (
    <div className="flex flex-col gap-2">
      {/* The app's own note sits ABOVE the cohort figures and in its own
          container — two different kinds of claim should not share a frame. */}
      {officialBlock}
    <div className="rounded-xl border border-accent-brand/25 bg-accent-brand/[0.04] p-3">
      {/* Header — explicitly a DIFFERENT source than the Arazim block above. */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-accent-brand/80">
          {isHe ? "מהסטודנטים באפליקציה" : "From students in the app"}
          {communityN > 0 && (
            <>
              {" "}
              <span className="text-foreground/40">
                (N=<Bidi text={String(communityN)} />)
              </span>
            </>
          )}
        </span>
      </div>

      {/* Block 1 — what students say */}
      {ratings?.revealed ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground/70">
          {/* Only render a dots row when there's actually an average — null maps
              to 0 filled dots, which reads as "lightest/easiest workload" instead
              of "no data" (QA 13.7). CohortCourseChip already guards this. */}
          {ratings.workloadAvg != null && (
            <span className="inline-flex items-center gap-1.5">
              {isHe ? "עומס" : "Workload"} <Dots value={ratings.workloadAvg} />
            </span>
          )}
          {ratings.difficultyAvg != null && (
            <span className="inline-flex items-center gap-1.5">
              {isHe ? "קושי" : "Difficulty"} <Dots value={ratings.difficultyAvg} />
            </span>
          )}
          {ratings.recommendShare != null && (
            <span className="font-medium text-foreground/80">
              <Bidi text={`${Math.round(ratings.recommendShare * 100)}%`} /> {isHe ? "ממליצים" : "recommend"}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
          <span>{isHe ? "עדיין אין מספיק דירוגים — היו הראשונים." : "Not enough ratings yet — be the first."}</span>
          <button
            type="button"
            onClick={onContribute}
            className="inline-flex min-h-[32px] items-center rounded-md bg-accent-brand/10 px-2 py-1 font-medium text-accent-brand transition-colors hover:bg-accent-brand/20"
          >
            {isHe ? "דרגו את הקורס" : "Rate it"}
          </button>
        </div>
      )}

      {/* Block 2 — community grade (never merged with the Arazim number) */}
      <div className="mt-3 border-t border-accent-brand/15 pt-3">
        {grade?.revealed ? (
          <>
            <p className="text-xs text-foreground/75">
              <span className="font-medium">{isHe ? "ממוצע קהילתי" : "Community avg"}</span>{" "}
              <Bidi text={String(grade.average ?? "")} />
              {grade.median != null && (
                <> · {isHe ? "חציון" : "median"} <Bidi text={String(grade.median)} /></>
              )}
              {grade.p25 != null && grade.p75 != null && (
                <> · {isHe ? "טווח" : "range"} <Bidi text={`${grade.p25}–${grade.p75}`} /></>
              )}
              {" "}
              <span className="text-foreground/40">(N=<Bidi text={String(grade.nGraded)} />)</span>
            </p>
            {binaryHigh && grade.binaryShare != null && (
              <p className="mt-1 text-[11px] text-foreground/50">
                <Bidi text={`${Math.round(grade.binaryShare * 100)}%`} /> {isHe ? "לקחו כ-binary (עובר/נכשל)" : "took it pass/fail"}
              </p>
            )}
            <p className="mt-1 text-[11px] text-foreground/45">
              {isHe ? "מהתורמים באפליקציה, לא ציון רשמי." : "From app contributors, not an official grade."}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-foreground/50">
            {/* The server now withholds the count below 2, the same way the
                ratings block beside it always has — "so a single contributor is
                never exposed". Printing "יש 1" for a niche elective states that
                exactly one person in a 24-person programme took it. Null means
                "too few to say", and that is what it says. */}
            {grade?.nGraded == null
              ? isHe
                ? "עוד לא נאספו מספיק ציונים לקורס הזה."
                : "Not enough grades collected for this course yet."
              : isHe
                ? `ציון קהילתי נחשף מ-5 תורמים. יש ${grade.nGraded}.`
                : `Community grade unlocks at 5 contributors. Have ${grade.nGraded}.`}
          </p>
        )}
      </div>

      {/* Block 3 — tips */}
      {reviews.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-accent-brand/15 pt-3">
          {reviews.map((r) => {
            const vm = r.verdict ? VERDICT_META[r.verdict] : null;
            return (
              <div key={r.id} className="rounded-lg border border-border/50 bg-background/40 p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {vm && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", vm.cls)}>
                      {verdictLabel(vm, isHe, course.isMandatory)}
                    </span>
                  )}
                  {r.tags.filter(isAllowedTag).map((tag) => (
                    <span key={tag} className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/60">
                      {isHe ? TAG_LABELS[tag].he : TAG_LABELS[tag].en}
                    </span>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-foreground/80">{r.tip}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-foreground/40">{r.cohortLabel ?? ""}</span>
                  <button
                    type="button"
                    onClick={() => report.mutate({ reviewId: r.id })}
                    disabled={report.isPending}
                    className="inline-flex items-center gap-1 text-[10px] text-foreground/35 transition-colors hover:text-red-500 disabled:opacity-50"
                    title={isHe ? "דווחו על התוכן" : "Report this"}
                  >
                    <Flag className="size-2.5" />
                    {isHe ? "דווח" : "Report"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onContribute}
        className="mt-3 inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-accent-brand/30 bg-accent-brand/5 px-2.5 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand/15"
      >
        <MessageSquarePlus className="size-3.5" />
        {isHe ? "הוסיפו טיפ / דרגו את הקורס" : "Add a tip / rate this course"}
      </button>
    </div>
    </div>
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
