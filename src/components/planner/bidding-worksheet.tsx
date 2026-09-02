"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Calculator,
  ChevronDown,
  AlertTriangle,
  Copy,
  Lightbulb,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import {
  checkAllocations,
  parseWorksheet,
  buildCheatSheet,
  worksheetStorageKey,
  PRIORITY_ORDER,
  MIN_BID,
  EMPTY_WORKSHEET,
  type WorksheetState,
  type BidPriority,
} from "@/lib/bidding-worksheet";
import {
  detectAllConflicts,
  type SessionInfo,
} from "@/lib/conflict-detector";
import { filterSessionsBySelectedGroups } from "@/components/onboarding/semester-planner/session-group-selector";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { UserCourseWithCourse } from "@/types/degree";
import type { DayOfWeek } from "@/types/enums";
import { sessionTypeNameFor } from "@/lib/group-options";
import { cn } from "@/lib/utils";
import { heNoun, heNounF } from "@/lib/he-count";

/**
 * Bidding worksheet — the student's OWN numbers, validated, never suggested.
 * TAU's point quota is unpublished, so the tool only does arithmetic: a pool
 * the student types in, per-course allocations, the 5-point floor, a live
 * remaining meter, the two-round reset, and an inline clash flag. Everything
 * persists to localStorage only (client-side; no DB column for bid points —
 * its mere presence would invite fabricated recommendations). Patterns follow
 * real bidding systems (Wharton/Kellogg/Ross worksheets + Coursicle prep).
 */

interface Row {
  courseCode: string;
  courseName: string;
  groupLabel: string | null;
  hasClash: boolean;
}

export function BiddingWorksheet({
  courses,
  targetYear,
  targetSemester,
}: {
  courses: UserCourseWithCourse[];
  /** #13 — the NEXT (bidding) semester, not the one on screen. */
  targetYear: number;
  targetSemester: "FALL" | "SPRING";
}) {
  const isHe = useLocale() === "he";
  const [open, setOpen] = useState(false);
  const selectedYear = targetYear;

  const coursesQuery = api.course.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  // Reference-stable (`?? []` mints a new array every render while loading —
  // the onboarding wizard's hydration render-loop class of bug, fixed 10.7).
  const allCourses = useMemo(
    () => (coursesQuery.data ?? []) as CourseWithSchedule[],
    [coursesQuery.data],
  );
  const courseById = useMemo(() => new Map(allCourses.map((c) => [c.id, c])), [allCourses]);
  // #13 (12.7) — the worksheet plans the BIDDING semester (the next one).
  const semester = targetSemester;

  // The semester's courses as worksheet rows + their clash set (same assembly
  // the overlap alert uses: group-filtered real sessions).
  const rows = useMemo<Row[]>(() => {
    const sessions: SessionInfo[] = [];
    const out: Row[] = [];
    for (const uc of courses) {
      if (uc.plannedYear !== selectedYear || uc.plannedSemester !== semester) continue;
      const c = courseById.get(uc.courseId);
      if (!c) continue;
      const sel = (uc as { selectedGroups?: unknown }).selectedGroups;
      const groups = sel && typeof sel === "object" ? (sel as Record<string, string>) : {};
      // ONE label source (lib/group-options). This worksheet used to carry its
      // own map that spelled `tutorial` "תרגיל" while the planner beside it said
      // "תרגול" for the very same meeting (deferred-3).
      const groupLabel = Object.entries(groups)
        .map(([type, code]) => `${sessionTypeNameFor(type, isHe)} ${code}`)
        .join(" · ") || null;
      out.push({ courseCode: c.code, courseName: isHe ? c.nameHe : (c.nameEn ?? c.nameHe), groupLabel, hasClash: false });
      if (c.scheduleSessions?.length) {
        for (const s of filterSessionsBySelectedGroups(c.scheduleSessions, groups)) {
          sessions.push({
            id: `${c.id}-${s.dayOfWeek}-${s.startTime}`,
            courseCode: c.code,
            courseName: c.nameHe,
            dayOfWeek: s.dayOfWeek as DayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            sessionType: s.sessionType,
          });
        }
      }
    }
    const clashCodes = new Set(
      detectAllConflicts(sessions).flatMap((x) => [x.existingSession.courseCode, x.newSession.courseCode]),
    );
    for (const r of out) r.hasClash = clashCodes.has(r.courseCode);
    return out;
  }, [courses, selectedYear, semester, courseById, isHe]);

  // ── Worksheet state, persisted per year+semester in localStorage ──
  const storageKey = worksheetStorageKey(selectedYear, semester);
  const [state, setState] = useState<WorksheetState>(EMPTY_WORKSHEET);
  const [round, setRound] = useState<"1" | "2">("1");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(parseWorksheet(localStorage.getItem(storageKey)));
    // Restore the chosen round too (#41) — it used to reset to "1" on refresh,
    // losing which round the student was mid-way through.
    setRound(localStorage.getItem(`${storageKey}:round`) === "2" ? "2" : "1");
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(`${storageKey}:round`, round);
  }, [round, storageKey, loaded]);

  const alloc = state.rounds[round];
  const check = useMemo(
    () => checkAllocations(state.pool, rows.map((r) => ({ courseCode: r.courseCode, points: alloc[r.courseCode] ?? null }))),
    [state.pool, rows, alloc],
  );
  const issueByCourse = useMemo(() => new Map(check.issues.map((i) => [i.courseCode, i.kind])), [check.issues]);

  const sortedRows = useMemo(
    () =>
      rows.slice().sort((a, b) => {
        const pa = PRIORITY_ORDER[state.priorities[a.courseCode] ?? "important"];
        const pb = PRIORITY_ORDER[state.priorities[b.courseCode] ?? "important"];
        return pa - pb || a.courseName.localeCompare(b.courseName, "he");
      }),
    [rows, state.priorities],
  );

  const setPoints = (code: string, v: string) =>
    setState((s) => ({
      ...s,
      rounds: { ...s.rounds, [round]: { ...s.rounds[round], [code]: v === "" ? null : Number(v) } },
    }));
  const setPriority = (code: string, p: BidPriority) =>
    setState((s) => ({ ...s, priorities: { ...s.priorities, [code]: p } }));

  const copySheet = async () => {
    const sheet = buildCheatSheet(
      isHe,
      round,
      sortedRows.map((r) => ({ ...r, points: alloc[r.courseCode] ?? null })),
    );
    try {
      await navigator.clipboard.writeText(sheet);
      toast.success(isHe ? "הועתק — הדביקו ליד מסך-הבידינג בידיעון" : "Copied — paste next to the Yedion bidding screen");
    } catch {
      // Clipboard can be blocked (permissions, insecure context, older Safari).
      // Never leave the click as a silent dead end.
      toast.error(isHe ? "ההעתקה נחסמה — סמנו והעתיקו ידנית" : "Copy was blocked — select and copy manually");
    }
  };

  if (rows.length === 0) return null;

  const PRIORITIES: { key: BidPriority; he: string; en: string }[] = [
    { key: "must", he: "חובה לנצח", en: "Must win" },
    { key: "important", he: "חשוב", en: "Important" },
    { key: "fallback", he: "גיבוי", en: "Fallback" },
  ];

  return (
    <div className="data-card overflow-clip p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-foreground/[0.02]"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
          <Calculator className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {isHe ? "גיליון בידינג — הנקודות שלכם" : "Bidding worksheet — your points"}
          </p>
          <p className="text-xs text-foreground/60">
            {isHe ? "אתם מזינים, אנחנו רק בודקים · נשמר במכשיר שלכם" : "You enter, we only validate · saved on your device"}
          </p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-foreground/60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/50 p-4">
          {/* Pool + round */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="bid-pool" className="text-[11px] text-foreground/60">
                {isHe ? "כמה נקודות יש לכם? (מופיע רק במסך-הבידינג בידיעון)" : "Your point pool (shown only on the Yedion bidding screen)"}
              </label>
              <input
                id="bid-pool"
                type="number"
                min={0}
                dir="ltr"
                value={state.pool ?? ""}
                onChange={(e) => setState((s) => ({ ...s, pool: e.target.value === "" ? null : Number(e.target.value) }))}
                placeholder={isHe ? "למשל 100" : "e.g. 100"}
                className="w-36 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm tabular-nums focus:border-foreground/30 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-foreground/60">{isHe ? "מקצה (הנקודות מתאפסות ביניהם)" : "Round (pool resets between them)"}</span>
              <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
                {(["1", "2"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRound(r)}
                    className={cn("px-3 py-2 transition-colors", round === r ? "bg-foreground text-background" : "text-foreground/70 hover:bg-foreground/5")}
                  >
                    {isHe ? `מקצה ${r}` : `Round ${r}`}
                  </button>
                ))}
              </div>
            </div>
            {/* Remaining meter */}
            <div className="ms-auto text-end">
              <p className="text-[11px] text-foreground/60">{isHe ? "נשאר במאגר" : "Remaining"}</p>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  check.remaining == null ? "text-foreground/60" : check.remaining < 0 ? "text-status-red" : "text-status-green",
                )}
                dir="ltr"
              >
                {check.remaining == null ? "—" : check.remaining}
              </p>
            </div>
          </div>

          {check.overPool && (
            <p className="flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-status-red">
              <AlertTriangle className="size-3.5 shrink-0" />
              {isHe ? `חילקתם ${heNounF(check.total, "נקודה", "נקודות")} אבל יש לכם רק ${state.pool}. תורידו ממשהו.` : `You allocated ${check.total} but only have ${state.pool}. Trim something.`}
            </p>
          )}
          {state.pool != null && !check.overPool && check.minFloor > state.pool && (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-status-amber">
              <AlertTriangle className="size-3.5 shrink-0" />
              {isHe
                ? `רק המינימום (5 × ${heNoun(check.minFloor / MIN_BID, "קורס", "קורסים")} = ${check.minFloor}) כבר עובר את המאגר שלכם — אי אפשר להתמכרז על כולם.`
                : `The floor alone (5 × ${check.minFloor / MIN_BID} courses = ${check.minFloor}) exceeds your pool — you can't bid on all of them.`}
            </p>
          )}

          {/* Course rows, ordered by the student's own priority */}
          <ul className="space-y-2">
            {sortedRows.map((r) => {
              const points = alloc[r.courseCode] ?? null;
              const issue = issueByCourse.get(r.courseCode);
              const pri = state.priorities[r.courseCode] ?? "important";
              return (
                <li key={r.courseCode} className={cn("rounded-lg border p-2.5", issue ? "border-red-400/40 bg-red-400/[0.04]" : "border-border/50")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground/80">
                        {r.courseName}
                        {r.hasClash && (
                          <span className="ms-1.5 inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-bold text-status-amber" title={isHe ? "חופף בזמן לקורס אחר שלכם — ראו את ההתראה למעלה" : "Time-clashes with another of your courses — see the alert above"}>
                            <AlertTriangle className="size-2.5" />
                            {isHe ? "חפיפה" : "clash"}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-foreground/60">
                        <span dir="ltr">{r.courseCode}</span>
                        {r.groupLabel ? ` · ${r.groupLabel}` : ""}
                      </p>
                    </div>
                    {/* Priority chips */}
                    <div className="flex overflow-hidden rounded-md border border-border/50 text-[10px]">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPriority(r.courseCode, p.key)}
                          aria-pressed={pri === p.key}
                          className={cn("px-1.5 py-1 transition-colors", pri === p.key ? "bg-accent-brand text-accent-brand-fg" : "text-foreground/70 hover:bg-foreground/5")}
                        >
                          {isHe ? p.he : p.en}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={points ?? ""}
                      onChange={(e) => setPoints(r.courseCode, e.target.value)}
                      placeholder={isHe ? "נק׳" : "pts"}
                      aria-label={isHe ? `נקודות ל${r.courseName}` : `Points for ${r.courseName}`}
                      className="w-20 rounded-lg border border-border/60 bg-card px-2 py-1.5 text-sm tabular-nums focus:border-foreground/30 focus:outline-none"
                    />
                  </div>
                  {issue === "below-min" && (
                    <p className="mt-1.5 text-[11px] text-status-red">
                      {isHe ? `מתחת ל-${heNounF(MIN_BID, "נקודה", "נקודות")} אי אפשר להיכנס למכרז על הקורס.` : `Below ${MIN_BID} points you can't enter the auction for this course.`}
                    </p>
                  )}
                  {issue === "not-integer" && (
                    <p className="mt-1.5 text-[11px] text-status-red">{isHe ? "מספרים שלמים בלבד." : "Whole numbers only."}</p>
                  )}
                  {issue === "negative" && (
                    <p className="mt-1.5 text-[11px] text-status-red">{isHe ? "אי אפשר מספר שלילי." : "Can't be negative."}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Safe, mechanism-based tips (never a predicted number) */}
          <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground/70">
              <Lightbulb className="size-3.5 text-status-amber" />
              {isHe ? "טיפים (מנגנון, לא ניחוש)" : "Tips (mechanics, not guesses)"}
            </p>
            <ul className="space-y-1 text-[11px] leading-snug text-foreground/60">
              <li className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-foreground/60" />{isHe ? "שוויון בסף נשבר בהגרלה — מספר קצת לא-עגול (כמו 41) גובר על העגול שכולם בוחרים (40)." : "Ties at the cutoff go to a lottery — a slightly odd number (41) beats the round one everyone picks (40)."}</li>
              <li className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-foreground/60" />{isHe ? "ביטול בין המקצים מחזיר את הנקודות — מקצה 2 מתחיל מחדש עם כל המאגר." : "Cancelling between rounds refunds points — round 2 starts fresh with the full pool."}</li>
              <li className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-foreground/60" />{isHe ? "תעדפו את מה שחייבים ומהר-מתמלא; את הבטוחים אפשר להשאיר על המינימום." : "Prioritize must-haves and fast-fillers; safe picks can sit at the minimum."}</li>
              <li className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-foreground/60" />{isHe ? "אנחנו לא יודעים את המכסה — הכלי רק בודק שהמספרים שלכם מסתדרים." : "We don't know the quota — this tool only checks your own numbers add up."}</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => void copySheet()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90"
          >
            <Copy className="size-4" />
            {isHe ? "העתיקו סיכום לידיעון" : "Copy summary for Yedion"}
          </button>
        </div>
      )}
    </div>
  );
}
