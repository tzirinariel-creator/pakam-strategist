"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { GraduationCap, AlertTriangle, CalendarDays, Scale, Share2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { type SharedCourse } from "@/lib/plan-share";
import { SharePlanDialog } from "./share-plan-dialog";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { YearBoard } from "./year-board";
import { PlacementIssuesCard } from "./placement-issues-card";
import { EconometricsNoteCard } from "./econometrics-note-card";
import { YearAtAGlanceCard } from "./year-at-a-glance-card";
import { AddCourseModal } from "./add-course-modal";
import { BiddingExplainer } from "./bidding-explainer";
import { BiddingTimeline } from "./bidding-timeline";
import { BiddingOverlapAlert } from "./bidding-overlap-alert";
import { BiddingWorksheet } from "./bidding-worksheet";
import { PlannerLiveTimetable } from "./planner-live-timetable";
import { DegreeStatus } from "@/components/dashboard/degree-status";
import { api } from "@/lib/trpc/react";
import { deriveYearOfStudy } from "@/lib/academic-calendar";
import { getBiddingTarget } from "@/lib/bidding-target";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { ReviewNudgeHost } from "@/components/catalog/review-nudge";
import { CalendarSyncNudge } from "@/components/calendar/calendar-sync-nudge";
import { daysUntilLabel } from "@/lib/days-until";

export function PlannerContent() {
  const t = useTranslations("planner");
  const tCommon = useTranslations("common");
  const tOnboarding = useTranslations("onboarding");
  const isHe = useLocale() === "he";

  const {
    data: planData,
    isLoading,
    error,
  } = api.plan.getUserPlan.useQuery(undefined, { retry: 1 });

  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, {
    retry: 1,
  });

  // Degree-progress headline is driven by the SAME source as the dashboard hero
  // and the King (getCredits.breakdown.effectiveTotal), so the "X / 150" number
  // never disagrees between screens. A raw sum of every course's credits counted
  // failed/exempt courses and ignored the miluim exemption. (audit #11)
  const creditsQuery = api.plan.getCredits.useQuery(undefined, { retry: 1 });
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: 1 });

  // Save confirmation (#18): the planner page redirects here with ?saved=1 after
  // persisting. Show an unmissable banner (the transient toast was easy to miss
  // mid-navigation) and strip the param so a refresh won't re-show it. It's
  // dismiss-only — NOT auto-hidden: this page mounts behind a loader while the
  // slow prod DB responds, so a timer started here could expire before the
  // content even renders (and the slow-DB user is exactly who #18 is about).
  // It clears on its own when the student navigates away.
  const searchParams = useSearchParams();
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Moving a mis-placed course. These two MUST stay above the early returns
  // below (`isLoading`, `error`, empty-plan): a hook that runs only once the
  // data has arrived changes the hook count between renders, which is React
  // #310 — and #310 here is not a warning, it is a blank error screen on the
  // planner. Unit tests, tsc and lint were all green; only opening the page
  // showed it.
  const placementUtils = api.useUtils();
  const movePlacement = api.plan.updateCourse.useMutation({
    onSuccess: () => invalidatePlanData(placementUtils),
  });
  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      setShowSavedBanner(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  // ------ Loading state ------
  if (isLoading) {
    return <ThemedLoader />;
  }

  // ------ Error state ------
  if (error) {
    const isUnauthorized = error.message.includes("UNAUTHORIZED") || error.message.includes("log in");

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="size-8 text-status-red" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        {isUnauthorized ? (
          <Link
            href="/login"
            className="text-sm text-foreground/80 underline underline-offset-4 hover:text-foreground/80"
          >
            {t("loginAgain")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-foreground/80 underline underline-offset-4 hover:text-foreground/80"
          >
            {tCommon("retry")}
          </button>
        )}
      </div>
    );
  }

  const courses = planData?.courses ?? [];

  // On 21.8 the catalog's semesters were corrected from the ידיעון. Plans built
  // against the old data kept the old placement — 26 rows across real accounts,
  // mostly מיקרו כלכלה א׳ left in spring. The fix proposes; it never moves a
  // course on its own.
  const placementRows = courses.map((uc) => ({
    userCourseId: uc.id,
    code: uc.course.code,
    nameHe: uc.course.nameHe,
    semesterOffered: (uc.course.semesterOffered ?? []).map(String),
    yearOffered: uc.course.yearOffered ?? [],
    plannedSemester: String(uc.plannedSemester),
    plannedYear: uc.plannedYear,
    status: uc.status,
    isMandatory:
      uc.course.courseType === "MANDATORY" || uc.course.isMandatory === true,
  }));

  // Year of study is DERIVED from the calendar (#39/#43) — powers the live
  // "בלימוד" tag on cards of the current semester.
  const currentYear = deriveYearOfStudy(profileQuery.data?.startYear, profileQuery.data?.currentYear ?? 1);
  // #13/#15 (12.7) — bidding concerns the NEXT teaching semester (what you
  // actually submit requests for), never the running one.
  const biddingTarget = getBiddingTarget(profileQuery.data?.startYear, profileQuery.data?.currentYear ?? 1);
  const biddingCourseCount = biddingTarget
    ? courses.filter(
        (uc) =>
          uc.plannedYear === biddingTarget.yearOfStudy &&
          uc.plannedSemester === biddingTarget.semester &&
          uc.status !== "COMPLETED" &&
          uc.status !== "FAILED",
      ).length
    : 0;

  // Share the plan as a link (no backend): pack course codes + placement into a
  // base64url token. The dialog shows exactly what a friend will (and won't)
  // see before anything leaves the device — no more deaf copy-to-clipboard.
  const sharedCourses: SharedCourse[] = courses.map((uc) => ({
    c: uc.course.code,
    y: uc.plannedYear,
    s: uc.plannedSemester as SharedCourse["s"],
  }));
  // #25 — the WhatsApp message needs to say what is IN the plan, so the detail
  // travels alongside the token. The token itself stays exactly as it was.
  const shareDetail = courses.map((uc) => ({
    code: uc.course.code,
    nameHe: uc.course.nameHe,
    nameEn: uc.course.nameEn ?? null,
    credits: uc.course.credits ?? 0,
    year: uc.plannedYear,
    semester: uc.plannedSemester as "FALL" | "SPRING" | "SUMMER",
  }));

  const handleShare = () => {
    if (sharedCourses.length === 0) {
      toast.error(isHe ? "אין קורסים לשיתוף" : "No courses to share");
      return;
    }
    setShareOpen(true);
  };

  // ------ Zero-course empty state ------
  // Defensive guard: new users who land here before completing onboarding
  // (which lives on /dashboard) would otherwise see an empty board. Point
  // them back to the dashboard where the onboarding wizard runs.
  if (courses.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 p-4 text-center md:p-6">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/10">
          <GraduationCap className="size-8 text-foreground/80" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-2xl font-bold text-foreground/80">
            {tOnboarding("welcomeTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tOnboarding("welcomeSubtitle")}
          </p>
        </div>
        {/* Ariel, #17: he clicked "הבידינג נפתח בעוד 8 ימים" and landed HERE,
            on a screen whose only way out was "לדף הבית" — "וגם תכלס זה לא
            באמת עובד ואין איזה מסך ייעודי וזה גרוע".
            A student with no plan, six days before registration, needs the
            door that BUILDS one. Going home is the thing they can already do. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/planner/semester"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-foreground/90"
          >
            {isHe ? "בואו נבנה את הסמסטר" : "Build your semester"}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
          >
            {tOnboarding("goToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  // The canonical credit breakdown the dashboard/King show — fed straight into
  // the shared <DegreeStatus> so the board mirrors home instead of re-deriving.
  const breakdown = creditsQuery.data?.breakdown;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* S1 — hosts the cohort-contribution sheet the grade-lock nudge opens
          (grades lock on the course cards of this board). */}
      <ReviewNudgeHost />
      {/* Ariel, 22.8: "לא התייחסת במתכנן לסיפור של האקונומטריקה היישומית".
          The secretariat's rule was on the graduation screen — reached after
          planning. It belongs where a course still gets added. */}
      <EconometricsNoteCard
        rows={courses.map((uc) => ({
          code: uc.course.code,
          status: uc.status,
          plannedYear: uc.plannedYear,
        }))}
        currentYear={currentYear}
      />

      <PlacementIssuesCard
        courses={placementRows}
        busy={movePlacement.isPending}
        onMove={(userCourseId, semester) =>
          movePlacement.mutate({ userCourseId, plannedSemester: semester })
        }
      />
      {/* Saved confirmation (#18) — unmissable, dismissible, auto-hides */}
      {showSavedBanner && (
        <div
          role="status"
          className="animate-fade-in flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-status-green">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground/85">
              {t("planSavedBannerTitle")}
            </p>
            <p className="mt-0.5 text-xs text-foreground/60">
              {t("planSavedBannerDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSavedBanner(false)}
            aria-label={isHe ? "סגור" : "Close"}
            className="shrink-0 rounded-md p-1 text-foreground/60 transition-colors hover:text-foreground/90"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="animate-stagger-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="size-7 text-foreground/80" />
          <div>
            <h1 className="text-2xl font-bold text-foreground/80">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("dragHint")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Regulation compliance badge */}
          {regulationQuery.data && (
            <Link
              href="/regulations"
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:shadow-sm",
                regulationQuery.data.passed === regulationQuery.data.totalRules
                  ? "border-emerald-400/30 bg-emerald-400/5 text-status-green hover:border-emerald-400/50"
                  : "border-amber-400/30 bg-amber-400/5 text-status-amber hover:border-amber-400/50"
              )}
            >
              <Scale className="h-3.5 w-3.5" />
              <Bidi text={`${regulationQuery.data.passed}/${regulationQuery.data.totalRules}`} />
            </Link>
          )}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/20 hover:bg-card/60 hover:text-foreground/80"
            title={isHe ? "שתף את התכנון עם חבר" : "Share your plan with a friend"}
          >
            <Share2 className="h-4 w-4" />
            {isHe ? "שתף" : "Share"}
          </button>
          <SharePlanDialog open={shareOpen} onOpenChange={setShareOpen} courses={sharedCourses} detail={shareDetail} />
          <Link
            href="/planner/semester"
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-4 py-2 text-sm text-foreground/60 transition-colors hover:border-foreground/20 hover:bg-card/60 hover:text-foreground/80"
          >
            <CalendarDays className="h-4 w-4" />
            {t("modifySemesterPlan")}
          </Link>
        </div>
      </div>

      {/* Status summary — the SAME render as home ("המצב שלי"): one super-number,
          one 4-segment bar. The board now MIRRORS home instead of drawing a
          second, differently-styled credit bar of the same number (the
          "three surfaces" confusion). One getCredits shape, one visual. */}
      <div className="animate-stagger-2 data-card p-4">
        <DegreeStatus variant="compact" credits={breakdown ?? null} isHe={isHe} />
      </div>

      {/* Main content — plan board beside a live timetable. On wide screens they
          sit side by side so the schedule updates as you drag a course; on a
          phone the timetable moves to the TOP (order-first) so the student sees
          their real week first instead of a long list (#20). */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="animate-stagger-3">
            <YearBoard courses={courses} currentYear={currentYear} />
          </div>
          {/* #13/#15 (12.7) — bidding help targets the NEXT semester (the one
              you bid for). With planned courses → the full toolkit; without —
              a short pointer instead of tools running on enrolled courses. */}
          {biddingTarget && (
            <div id="bidding" className="animate-stagger-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-bold text-foreground/80">
                  {isHe
                    ? `לקראת המכרז — ${biddingTarget.labelHe} הקרוב`
                    : `Toward the bidding round — the coming ${biddingTarget.semester === "FALL" ? "fall" : "spring"}`}
                </h2>
                <span className="text-xs text-foreground/60">
                  {isHe
                    ? `הסמסטר נפתח ${daysUntilLabel(biddingTarget.daysUntilStart, true)} — המכרז מתקיים לפני כן`
                    : `Semester starts ${daysUntilLabel(biddingTarget.daysUntilStart, false)} — bidding happens before`}
                </span>
              </div>
              {/* WHEN comes before HOW: the app used to explain the mechanism
                  while knowing no dates at all. Shown regardless of whether
                  courses are planned yet — the deadline is real either way. */}
              <BiddingTimeline isHe={isHe} />
              {/* Ariel, 21.8 — the toolkit below is scoped to the NEXT
                  semester, which is the wrong scope for PPE: part of semester
                  ב׳ is registered in this same round. Both terms together,
                  above the per-semester tools. */}
              <YearAtAGlanceCard courses={courses} yearOfStudy={biddingTarget.yearOfStudy} />
              {biddingCourseCount > 0 ? (
                <>
                  <BiddingOverlapAlert
                    courses={courses}
                    targetYear={biddingTarget.yearOfStudy}
                    targetSemester={biddingTarget.semester}
                  />
                  <BiddingWorksheet
                    courses={courses}
                    targetYear={biddingTarget.yearOfStudy}
                    targetSemester={biddingTarget.semester}
                  />
                </>
              ) : (
                <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-4 text-xs leading-relaxed text-foreground/60">
                  {isHe
                    ? `עוד לא תכננתם קורסים ל${biddingTarget.labelHe} הקרוב. גררו קורסים ללוח למעלה — ואז נבדוק לכם חפיפות ונכין רשימת-בדיקה למכרז.`
                    : "You haven't planned the coming semester yet. Drag courses onto the board above — then we'll check clashes and prep your bidding checklist."}
                </div>
              )}
              <BiddingExplainer isHe={isHe} />
            </div>
          )}
        </div>

        {/* Live timetable — on top on a phone (order-first), sticky alongside
            the board on xl+ (order-none restores the natural side-by-side). */}
        <div className="order-first flex animate-stagger-3 flex-col gap-4 xl:order-none xl:sticky xl:top-4 xl:w-[380px] xl:shrink-0">
          <PlannerLiveTimetable courses={courses} currentYear={currentYear} />
          {/* #40 — the offer belongs beside the artifact it copies. A student
              looking at their own week here is exactly the person for whom
              "put this in my calendar" is worth a tap; the same one-tap refusal
              retires it everywhere (shared dismiss key). */}
          <CalendarSyncNudge show={courses.length > 0} />
        </div>
      </div>

      {/* Add course modal */}
      <AddCourseModal />
    </div>
  );
}
