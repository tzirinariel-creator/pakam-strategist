"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { getPlanningAnchor } from "@/lib/academic-calendar";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import { StepWelcome } from "./step-welcome";
import { StepProfile } from "./step-profile";
import {
  StepHistory,
  getPastSemesters,
  buildDefaultCompleted,
  type CompletedCourse,
} from "./step-history";
import { SemesterPlanner, type PlannedSemester } from "./semester-planner/index";
import { StepStanding, type StandingResult } from "./step-standing";
import { StepReady } from "./step-ready";
import { PlannerErrorBoundary } from "./planner-error-boundary";
import type { CourseWithSchedule } from "@/lib/plan-generator";
import type { SessionGroupSelections } from "./semester-planner/live-timetable";
import { getProgramById } from "@/lib/programs/registry";

export interface OnboardingData {
  program: string | null;
  year: number;
  semester: "FALL" | "SPRING";
  focusArea: string | null;
  miluimGroup: "NONE" | "GROUP_A" | "GROUP_B" | "GROUP_C" | "GROUP_G";
  /** AMIRANT English placement score (50–150 scale). DB column stays `amiramScore`. */
  amirantScore: number | null;
  /** #23 — English level straight off the grade sheet (no number). Overrides the
   *  score when set — for a student who knows their level but not their score. */
  englishLevel: string | null;
  /**
   * Optional per-semester miluim inputs captured in step-profile (days served +
   * combat status). When set, step-ready upserts ONE MiluimSemester for the
   * student's starting {year, semester}. Absent → no per-semester row written,
   * so behavior is unchanged for users who skip miluim.
   */
  miluimDays?: number | null;
  miluimCombat?: boolean;
  /** Group C via career service (not 35+ reserve days) — drives the label. */
  miluimCareerService?: boolean;
  /** Personal address — name + gender for a personalized, gendered UI. */
  firstName?: string | null;
  lastName?: string | null;
  gender?: "male" | "female" | null;
  /**
   * #13b — the semester was chosen (or derived from a real grade sheet) rather
   * than assumed. Once true, step-profile stops overwriting it with the
   * calendar default, so a year-1 student who starts in סמסטר ב׳ (a late
   * intake, a repeat, a return from miluim) is no longer forced into סמסטר א׳.
   */
  semesterExplicit?: boolean;
}

// Welcome → Standing → Profile → [History] → SemesterPlanner → Ready
//
// #11/#26 — STANDING is the new first question ("do you already have
// credits?"). It exists because the flow used to assume everyone was a fresh
// year-1 student and marched a third-year through building a year-1 semester-א׳
// timetable full of courses they'd already passed. A returning student can now
// hand the app their grade sheet before they type anything.
//
// #7 (13.8) — HISTORY is now shown ONLY on the manual path. A student who
// scanned their sheet reviewed and CORRECTED every row on the standing screen
// (#5), so walking them through the same rows again two steps later was pure
// duplication ("למה יש עוד שלב של מעבר על הגיליון - זאת קצת כפילות"). A
// returning student who has no sheet still needs the step, and a fresh year-1
// student still skips it — see `showHistoryStep`.
const TOTAL_STEPS = 6;
const STEP_STANDING = 1;
const STEP_PROFILE = 2;
const STEP_HISTORY = 3;
const STEP_PLANNER = 4;
const STEP_READY = 5;

function getDefaultSemester(year: number): "FALL" | "SPRING" {
  // A first-year student's "starting now" is almost always the fall intake —
  // the standard PPE cohort begins in סמסטר א׳. (persona review #26)
  // Everyone else gets the PLANNING ANCHOR from the academic calendar — the
  // month heuristic was replaced by the verified TAU date table (#39).
  if (year <= 1) return "FALL";
  return getPlanningAnchor().semester;
}

// In-progress onboarding is persisted here so a refresh or an accidental
// back/forward never wipes a half-built plan (reported #13). Cleared by
// step-ready once the plan is saved.
// Scoped to the account on purpose.
//
// The saved blob holds a first name, a surname, a gender, a year, a semester
// and the entire course map read off a grade sheet. Under one global key it
// outlived the person who typed it: a student who abandoned signup halfway, or
// logged out, left all of it in the browser — and the next person to sign up
// on that machine (a library computer, a shared laptop, this project's own
// test account after a reset) had the wizard restore it as their own.
//
// The suffix is the Supabase user id. A logged-out visitor gets "anon", which
// is the one case where sharing is harmless because there is nothing personal
// to share yet.
const ONBOARDING_STATE_PREFIX = "pakamon-onboarding-state";
const LEGACY_ONBOARDING_STATE_KEY = "pakamon-onboarding-state";

function onboardingStateKey(userId: string | null | undefined): string {
  return `${ONBOARDING_STATE_PREFIX}:${userId ?? "anon"}`;
}

function loadOnboardingState(userId: string | null | undefined): {
  step?: number;
  data?: Partial<OnboardingData>;
  plannedSemesters?: PlannedSemester[] | null;
  sessionGroupSelections?: SessionGroupSelections;
  completedCourses?: Record<string, CompletedCourse>;
  removedCourseCodes?: string[];
  /** Codes read off the grade sheet — the exemption that keeps them from being
   *  pruned on restore. Its absence was the whole of #34. */
  sheetCourseCodes?: string[];
  sheetSeeded?: boolean;
  manualHistory?: boolean;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(onboardingStateKey(userId));
    // A blob left under the old, unscoped key belongs to whoever was last at
    // this browser — which may not be the person now signing up. It is removed
    // rather than migrated: losing a half-built wizard once is the safe
    // failure, restoring someone else's name and grades is not.
    localStorage.removeItem(LEGACY_ONBOARDING_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  // Only for scoping the saved wizard state to this account — see
  // onboardingStateKey. Nothing on screen depends on it, so a slow or failed
  // profile fetch simply means the state is scoped to "anon" for that render.
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: 1, staleTime: 5 * 60 * 1000 });
  const locale = useLocale();
  const BackChevron = locale === "he" ? ChevronRight : ChevronLeft;
  const NextChevron = locale === "he" ? ChevronLeft : ChevronRight;
  const [step, setStep] = useState(0);
  const [plannedSemesters, setPlannedSemesters] = useState<PlannedSemester[] | null>(null);
  const [sessionGroupSelections, setSessionGroupSelections] = useState<SessionGroupSelections>({});
  // Past academic record ("Your history") — keyed by courseCode.
  const [completedCourses, setCompletedCourses] = useState<Record<string, CompletedCourse>>({});
  // Whether we've seeded the history map with the default mandatory pre-fill.
  const historySeeded = useRef(false);
  // Course codes the student EXPLICITLY un-checked in the history step. The
  // reconcile effect must never re-seed one of these — otherwise a course they
  // said they didn't take reappears checked and is saved as COMPLETED (#audit-r4).
  const removedCodes = useRef<Set<string>>(new Set());
  // Codes that came from a real grade sheet rather than from our assumption
  // about what a student in year N "must have" finished. The distinction
  // matters at prune time — see the effect below.
  const sheetCodes = useRef<Set<string>>(new Set());
  // #26 — TRUE once the history map came from a real grade sheet. From then on
  // the sheet is the source of truth about what the student passed, so the
  // "pre-check every past mandatory course" assumption (buildDefaultCompleted,
  // #18) must stop: adding a course the sheet does NOT show would be inventing
  // a completion on top of an official document. Kept in state (not a ref) so
  // the reconcile effect re-runs when it flips.
  const [sheetSeeded, setSheetSeeded] = useState(false);
  // #7 (13.8) — TRUE only for a returning student who did NOT hand us a sheet.
  // They are the one group that still needs the separate history step, because
  // nothing has been read for them yet. Decided by the student's own answer on
  // the standing step, never inferred from year/semester (see `hasHistory`
  // below for why that inference was broken).
  const [manualHistory, setManualHistory] = useState(false);

  // Wrap the history-map setter so a removal (a code that was present and is now
  // gone) is remembered, and a (re)add clears that memory.
  const handleCompletedChange = useCallback((next: Record<string, CompletedCourse>) => {
    setCompletedCourses((prev) => {
      for (const code of Object.keys(prev)) {
        if (!next[code]) removedCodes.current.add(code);
      }
      for (const code of Object.keys(next)) removedCodes.current.delete(code);
      return next;
    });
  }, []);

  // Prefetch courses immediately so they're ready by step 2. Retry on failure:
  // the whole wizard depends on this list, and a single dropped request on a
  // flaky mobile network must not leave the student with an empty catalog.
  const coursesQuery = api.course.list.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes — course list rarely changes
  });
  // MUST be reference-stable: the history-reconcile effect below depends on
  // `allCourses` and setStates a fresh object. A bare `?? []` mints a NEW array
  // every render while the query loads → effect re-fires → render loop until
  // React throws "Maximum update depth exceeded" (hydration burst, caught 10.7).
  const allCourses = useMemo(
    () => (coursesQuery.data ?? []) as CourseWithSchedule[],
    [coursesQuery.data],
  );

  const [data, setData] = useState<OnboardingData>({
    program: getProgramById(null).programCode, // Default program, user selects in StepWelcome
    year: 1,
    semester: getDefaultSemester(1),
    focusArea: null,
    miluimGroup: "NONE",
    amirantScore: null,
    englishLevel: null,
    miluimCareerService: false,
    firstName: null,
    lastName: null,
    gender: null,
  });

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Does this student have any semester behind them at all?
  //
  // This ALONE used to decide the history step — and it reads data.year /
  // data.semester, which are still the year-1 defaults while the student is
  // standing ON the standing step. So the rail rendered 4 items, the student
  // scanned their sheet, the year jumped to 3, and the rail silently grew to 5
  // under them (#7). It is now one of two conditions, and the other one is a
  // decision the student made explicitly.
  const hasPastSemesters = useMemo(
    () => getPastSemesters(data.year, data.semester).length > 0,
    [data.year, data.semester]
  );

  // The separate history step exists for exactly one student: a returning one
  // with no sheet. With a sheet, the review already happened (and was editable)
  // on the standing step; fresh year-1 students have nothing to review.
  //
  // Stable where it used to move on its own: a scan can no longer add a step,
  // because `manualHistory` is false on the sheet path regardless of the year it
  // reads. The rail can still change on the MANUAL path when the student picks
  // their year on the profile step — that one is their own edit, on the screen
  // they are looking at, and it is the honest answer to what they just said.
  const showHistoryStep = manualHistory && hasPastSemesters;

  // Resolve the history step's completed courses (keyed by code) to catalog
  // ids, so the planner can exclude already-done courses from its pool and
  // count their credits toward the running degree total (fixes #18: a mid-degree
  // student's completed history was invisible inside the planner).
  const completedCourseIdList = useMemo(() => {
    const idByCode = new Map(allCourses.map((c) => [c.code, c.id]));
    return Object.values(completedCourses)
      .map((cc) => idByCode.get(cc.courseCode))
      .filter((id): id is string => Boolean(id));
  }, [allCourses, completedCourses]);

  // Seed the history map with the default mandatory pre-fill the first time
  // the student reaches the history step (year/semester are now final).
  const seedHistory = useCallback(() => {
    if (historySeeded.current) return;
    historySeeded.current = true;
    setCompletedCourses(
      buildDefaultCompleted(allCourses, data.year, data.semester)
    );
  }, [allCourses, data.year, data.semester]);

  // ── Persist in-progress onboarding (fixes #13) ──────────────────────────
  // Two-pass: restore once after mount (avoids any SSR hydration mismatch),
  // then persist on every change. The `hydrated` gate prevents the first
  // persist from overwriting saved state with defaults before restore applies.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const s = loadOnboardingState(profileQuery.data?.supabaseId);
    if (s) {
      if (typeof s.step === "number") setStep(s.step);
      if (s.data) setData((d) => ({ ...d, ...s.data }));
      if (s.plannedSemesters) setPlannedSemesters(s.plannedSemesters);
      if (s.sessionGroupSelections) setSessionGroupSelections(s.sessionGroupSelections);
      if (s.completedCourses) {
        setCompletedCourses(s.completedCourses);
        if (Object.keys(s.completedCourses).length > 0) historySeeded.current = true;
      }
      if (s.removedCourseCodes) removedCodes.current = new Set(s.removedCourseCodes);
      // Restored BEFORE sheetSeeded below, so the prune never runs a frame with
      // the flag set and the set empty. (#34)
      if (s.sheetCourseCodes) sheetCodes.current = new Set(s.sheetCourseCodes);
      if (s.sheetSeeded) setSheetSeeded(true);
      if (s.manualHistory) setManualHistory(true);
    }
    setHydrated(true);
    // Deliberately keyed on the id: until the profile resolves there is no
    // account to scope to, and restoring from "anon" would be reading a
    // stranger's bucket on a shared machine.
  }, [profileQuery.data?.supabaseId]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        onboardingStateKey(profileQuery.data?.supabaseId),
        // #34. sheetCourseCodes was the ONE thing this snapshot left out, and it
        // is the thing that protects the scanned grade sheet.
        //
        // The reconcile effect below keeps a completed row only if its code is
        // in `sheetCodes` or it sits in a past semester. `sheetCodes` is a ref
        // and was never persisted — so a refresh (or one failed plan refetch)
        // restored `sheetSeeded: true` with an EMPTY set: every scanned row lost
        // its exemption and was pruned, and because sheetSeeded was true the
        // re-seed that would have replaced them was skipped. Zero COMPLETED rows
        // reached the database.
        //
        // That is precisely the state the comment on that effect says it exists
        // to prevent, and it is the mechanism behind "העליתי בהתחלה סילבוס וזה
        // פשוט לא עבר לכאן".
        JSON.stringify({ step, data, plannedSemesters, sessionGroupSelections, completedCourses, removedCourseCodes: [...removedCodes.current], sheetCourseCodes: [...sheetCodes.current], sheetSeeded, manualHistory })
      );
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [hydrated, step, data, plannedSemesters, sessionGroupSelections, completedCourses, sheetSeeded, manualHistory]);

  // Keep the pre-filled history IN SYNC with the year/semester anchor. Whenever
  // it changes, drop any completed course that's no longer in a past semester (a
  // student who lowers to year-1-FALL keeps NONE — so a fresh student is never
  // silently recorded as having completed courses), and pre-fill any newly-past
  // mandatory — WITHOUT clobbering grades/edits the student already entered
  // (fixes the stale-map + one-shot-seed bugs, #audit-r3).
  useEffect(() => {
    if (!hydrated) return;
    const past = getPastSemesters(data.year, data.semester);
    const pastKeys = new Set(past.map((s) => `${s.year}-${s.semester}`));
    setCompletedCourses((prev) => {
      const kept: typeof prev = {};
      for (const [code, cc] of Object.entries(prev)) {
        // Ariel, 1.9: "העליתי בהתחלה סילבוס וזה פשוט לא עבר לכאן… הוא גם אומר
        // שהשלמתי 5 אחוז".
        //
        // This prune exists so that a student who LOWERS their declared year
        // stops carrying completions we merely assumed for them. It was also
        // eating the rows read off their actual grade sheet, and for a first
        // year it ate all of them: getPastSemesters(1, "FALL") is empty — there
        // is no semester before the first — so pastKeys was empty and every
        // scanned row failed this test. Zero COMPLETED rows reached the
        // database, and the progress bar showed only the miluim exemption: 5%.
        //
        // The rule the comment below already states — "a real grade sheet
        // OUTRANKS the assumption" — was applied to the ADD half and not to
        // this one. A row the university printed is not ours to discard
        // because it does not fit a semester the student typed.
        if (sheetCodes.current.has(code) || pastKeys.has(`${cc.plannedYear}-${cc.plannedSemester}`)) {
          kept[code] = cc;
        }
      }
      // #26 — a real grade sheet OUTRANKS the assumption. When the map was
      // seeded from a scan, we add nothing: the sheet lists what was passed,
      // and topping it up with "they must have done the year-1 mandatory
      // courses" would record completions the official document does not show.
      if (!sheetSeeded) {
        const seed = buildDefaultCompleted(allCourses, data.year, data.semester);
        for (const [code, cc] of Object.entries(seed)) {
          // Never re-seed a course the student explicitly un-checked (#audit-r4).
          if (!kept[code] && !removedCodes.current.has(code)) kept[code] = cc;
        }
      }
      return kept;
    });
    historySeeded.current = pastKeys.size > 0;
  }, [hydrated, data.year, data.semester, allCourses, sheetSeeded]);

  // Ariel, 1.9: "כשאני מסיים לעלות את הסילבוס — זה זורק אותי לתחתית העמוד של
  // המשך ההרשמה במקום לחלק העליון."
  //
  // Nothing was throwing him anywhere: the browser simply kept its scroll
  // offset while the step underneath it changed. He had scrolled to the bottom
  // of a long list of scanned courses to reach "נכון — המשיכו מכאן", the next
  // step rendered, and he landed in the middle of it — below its heading, its
  // progress bar and its instructions, with no reason to suspect they existed.
  //
  // The protected shell's <main> is an ordinary block, so window scroll is the
  // scroll that matters. "instant" rather than "smooth" on purpose: a step
  // change is a new screen, not a movement within one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  const goNext = useCallback(() => {
    setStep((prev) => {
      // From Profile: go to History only on the manual path — a scanned student
      // already reviewed and corrected their rows on the standing step (#7).
      if (prev === STEP_PROFILE) {
        if (showHistoryStep) {
          seedHistory();
          return STEP_HISTORY;
        }
        return STEP_PLANNER;
      }
      return Math.min(prev + 1, TOTAL_STEPS - 1);
    });
  }, [showHistoryStep, seedHistory]);

  const goBack = useCallback(() => {
    setStep((prev) => {
      // From Planner: go back to History if it exists, else to Profile.
      if (prev === STEP_PLANNER) {
        return showHistoryStep ? STEP_HISTORY : STEP_PROFILE;
      }
      return Math.max(prev - 1, 0);
    });
  }, [showHistoryStep]);

  // #11/#26 — the answer to "where are you in the degree?". A fresh student is
  // pinned to year 1 and walks the original path. A returning student who
  // scanned their sheet arrives here with a real year, a real semester and a
  // real completed-course map — so the planner they reach is THEIR semester,
  // not a year-1 timetable of courses they finished two years ago.
  //
  // Nothing is persisted here. The seed lands in the review step, where the
  // student can un-check or correct any row before the single save at the end.
  const handleStandingDone = useCallback((result: StandingResult) => {
    if (result.choice === "fresh") {
      updateData({ year: 1, semester: "FALL", semesterExplicit: false });
      setSheetSeeded(false);
      sheetCodes.current = new Set();
      setManualHistory(false);
      setStep(STEP_PROFILE);
      return;
    }
    // #7 — a returning student who did NOT confirm a sheet gets the history
    // step; one who did has already reviewed (and corrected) every row here.
    setManualHistory(!result.fromSheet);
    if (result.year != null && result.semester != null) {
      updateData({
        year: result.year,
        semester: result.semester,
        semesterExplicit: true,
        ...(result.englishLevel ? { englishLevel: result.englishLevel } : {}),
      });
    }
    if (result.completedSeed && Object.keys(result.completedSeed).length > 0) {
      setCompletedCourses(result.completedSeed);
      historySeeded.current = true;
      // Anything the sheet did NOT list is, by the sheet's own account, not
      // done — so clear stale removals and let the sheet stand on its own.
      removedCodes.current = new Set();
      // Remember WHICH rows the sheet produced. The year/semester prune below
      // spares exactly these: the university printed them, so they are not
      // ours to drop because they do not fit a semester the student typed.
      sheetCodes.current = result.fromSheet
        ? new Set(Object.keys(result.completedSeed))
        : new Set();
      setSheetSeeded(Boolean(result.fromSheet));
    }
    setStep(STEP_PROFILE);
  }, [updateData]);

  // Called when SemesterPlanner finishes (user clicks "Finish planning")
  // #8 — the THIRD argument matters. A student who adds an off-catalog course
  // during onboarding and declares which discipline it counts toward would
  // otherwise have that declaration dropped on the floor here, and savePlan
  // deletes+recreates every planned row, so it could never be recovered by a
  // later edit either. Carried through to StepReady and into the save.
  const [disciplineOverrides, setDisciplineOverrides] = useState<Record<string, string>>({});
  // Off-catalog courses the planner just registered. They are deliberately
  // absent from the public catalog, so StepReady — which prices the plan from
  // `allCourses` — cannot see them and undercounted the semester by exactly
  // their credits.
  const [registeredCustom, setRegisteredCustom] = useState<CourseWithSchedule[]>([]);
  const handlePlanFinish = useCallback(
    (
      semesters: PlannedSemester[],
      selections: SessionGroupSelections,
      overrides: Record<string, string>,
      registered?: { id: string; code: string; nameHe: string; credits: number }[],
    ) => {
      setPlannedSemesters(semesters);
      setSessionGroupSelections(selections);
      setDisciplineOverrides(overrides);
      setRegisteredCustom(
        (registered ?? []).map(
          (c) =>
            ({
              id: c.id,
              code: c.code,
              nameHe: c.nameHe,
              nameEn: c.nameHe,
              credits: c.credits,
              scheduleSessions: [],
            }) as unknown as CourseWithSchedule,
        ),
      );
      setStep(STEP_READY); // Go to StepReady
    },
    []
  );

  // #21/#36 — the stepped flow Ariel liked, made legible: every step names
  // itself and shows where it sits in the sequence, so "what screen am I on and
  // what comes next" is never a guess. The history step is conditional, so the
  // list is built per-student rather than hard-coded.
  const flowSteps: { step: number; he: string; en: string }[] = [
    { step: STEP_STANDING, he: "נקודת הפתיחה", en: "Starting point" },
    { step: STEP_PROFILE, he: "הפרופיל", en: "Profile" },
    ...(showHistoryStep ? [{ step: STEP_HISTORY, he: "מה כבר עשיתם", en: "What you've done" }] : []),
    { step: STEP_PLANNER, he: "מערכת השעות", en: "Timetable" },
    { step: STEP_READY, he: "סיום", en: "Done" },
  ];
  const flowIndex = flowSteps.findIndex((s) => s.step === step);
  // Profile step has sensible defaults (year/semester) and focus area is
  // genuinely optional — "undecided" (null) is a valid choice the hint
  // actively recommends — so never gate Next on it.
  const canProceed = step === STEP_PROFILE;

  return (
    <div className="bg-mesh -m-2 min-h-full w-auto sm:-m-4 md:-m-6">
    {/* The planner step needs REAL width. Every other step is prose + a few
        controls and reads better narrow, but the timetable is a container-query
        component: WeeklyTimetable only renders its weekly GRID once its own box
        clears 512px, and falls back to a day-by-day agenda list below that.
        Under the old blanket max-w-4xl (896px) the timetable column resolved to
        ~472px on every desktop — 40px short — so the grid was never once shown
        to a desktop user, while a NARROWER window would have shown it. Ariel
        saw the list for months and reported it three times. */}
    <div
      className={cn(
        "relative mx-auto flex min-h-[80vh] w-full flex-col px-4 py-8 md:px-8",
        step === STEP_PLANNER ? "max-w-7xl" : "max-w-4xl",
      )}
    >
      {/* #21/#36 — the flow rail. Present on every step after the welcome, so a
          new user always knows which of the numbered steps they are on, what
          the step is called, and what still lies ahead. */}
      {flowIndex >= 0 && (
        <nav
          aria-label={locale === "he" ? "שלבי ההרשמה" : "Signup steps"}
          data-testid="onboarding-flow-rail"
          className="animate-fade-in mb-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5"
        >
          {flowSteps.map((s, i) => {
            const state = i < flowIndex ? "done" : i === flowIndex ? "current" : "todo";
            return (
              <span key={s.step} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-foreground/15">·</span>}
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition-colors",
                    state === "current"
                      ? "bg-accent-brand/12 font-semibold text-accent-brand"
                      : state === "done"
                        ? "bg-foreground/5 text-foreground/45"
                        : "text-foreground/30",
                  )}
                >
                  {/* The period must stay OUTSIDE the isolate. Inside it, the
                      isolate renders "1." as one LTR box placed at the RTL line
                      start, so the dot ends up on the far right and the label
                      reads ". 1 נקודת הפתיחה". Only the digit is isolated. */}
                  <bdi dir="ltr">{i + 1}</bdi>. {locale === "he" ? s.he : s.en}
                </span>
              </span>
            );
          })}
        </nav>
      )}

      {/* Progress bar. It used to live only on the Profile step and was pinned
          at "step 1 of N" no matter where you were — an indicator that never
          moved. It now tracks the real flow position alongside the named rail
          above (#36). */}
      {flowIndex >= 0 && (
        <div className="animate-fade-in mb-8">
          <div className="mb-2 flex items-center justify-between text-xs text-foreground/40">
            <span className="tabular">
              {t("step")} <bdi dir="ltr">{flowIndex + 1}</bdi> {t("of")}{" "}
              <bdi dir="ltr">{flowSteps.length}</bdi>
            </span>
            <span className="tabular">
              <bdi dir="ltr">{Math.round(((flowIndex + 1) / flowSteps.length) * 100)}%</bdi>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="progress-gradient h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((flowIndex + 1) / flowSteps.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1">
        <PlannerErrorBoundary>
          <div key={step} className="animate-fade-in">
            {step === 0 && (
              <StepWelcome
                onNext={goNext}
                selectedProgram={data.program}
                onProgramSelect={(code) => updateData({ program: code })}
              />
            )}
            {step === STEP_STANDING && (
              <StepStanding
                allCourses={allCourses}
                isLoadingCourses={coursesQuery.isLoading}
                onDone={handleStandingDone}
                onBack={goBack}
              />
            )}
            {step === STEP_PROFILE && (
              <StepProfile data={data} onUpdate={updateData} sheetSeeded={sheetSeeded} />
            )}
            {/* Q11(א): the history + planner steps are unusable without the
                catalog. When course.list failed (after its retries), say so
                honestly and offer a retry — never a silent empty screen. */}
            {(step === STEP_HISTORY || step === STEP_PLANNER) && coursesQuery.isError ? (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
                <p className="text-sm font-semibold text-foreground/80">
                  {locale === "he" ? "לא הצלחנו לטעון את קטלוג הקורסים" : "We couldn't load the course catalog"}
                </p>
                <p className="text-xs text-foreground/50">
                  {locale === "he"
                    ? "בלי הקטלוג אי אפשר לבנות את התוכנית. בדקו את החיבור ונסו שוב."
                    : "The plan can't be built without the catalog. Check your connection and try again."}
                </p>
                <button
                  type="button"
                  onClick={() => void coursesQuery.refetch()}
                  className="rounded-xl bg-foreground px-6 py-2.5 text-sm font-bold text-background transition-transform hover:scale-[1.02]"
                >
                  {locale === "he" ? "נסו שוב" : "Try again"}
                </button>
              </div>
            ) : (
              <>
                {step === STEP_HISTORY && (
                  <StepHistory
                    data={data}
                    allCourses={allCourses}
                    isLoadingCourses={coursesQuery.isLoading}
                    value={completedCourses}
                    onChange={handleCompletedChange}
                    onNext={goNext}
                    onBack={goBack}
                    sheetSeeded={sheetSeeded}
                  />
                )}
                {step === STEP_PLANNER && (
                  <SemesterPlanner
                    data={data}
                    allCourses={allCourses}
                    isLoadingCourses={coursesQuery.isLoading}
                    onFinish={handlePlanFinish}
                    externalCompletedCourseIds={completedCourseIdList}
                    // The planner needs the completed rows to say anything
                    // about English standing — Ariel, 21.8: "לא מובן במסך
                    // התכנון שעשיתי אנגלית".
                    completedRows={Object.values(completedCourses).map((c) => ({
                      nameHe: c.customName ?? allCourses.find((a) => a.code === c.courseCode)?.nameHe ?? c.courseCode,
                      courseCode: c.courseCode,
                      grade: c.grade,
                      status: "COMPLETED" as const,
                      credits:
                        allCourses.find((a) => a.code === c.courseCode)?.credits ?? c.credits ?? 2,
                    }))}
                  />
                )}
              </>
            )}
            {step === STEP_READY && (
              <StepReady
                data={data}
                plannedSemesters={plannedSemesters}
                completedCourses={Object.values(completedCourses)}
                allCourses={[...allCourses, ...registeredCustom]}
                sessionGroupSelections={sessionGroupSelections}
                disciplineOverrides={disciplineOverrides}
              />
            )}
          </div>
        </PlannerErrorBoundary>
      </div>

      {/* Navigation buttons — only on Profile step (History/Planner/Ready
          render their own controls). */}
      {step === STEP_PROFILE && (
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-foreground/50 transition-all hover:bg-foreground/5 hover:text-foreground/70"
          >
            <BackChevron className="h-4 w-4" />
            {t("back")}
          </button>

          <button
            onClick={goNext}
            disabled={!canProceed}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-sm font-medium shadow-sm transition-all",
              canProceed
                ? "bg-foreground text-background hover:scale-[1.02] press-scale"
                : "bg-foreground/30 text-background/50 cursor-not-allowed"
            )}
          >
            {t("next")}
            <NextChevron className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
