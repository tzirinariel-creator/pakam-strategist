"use client";

// =========================================================================
// תיק המחזור (notes 3+16+20, approved plan stages א+ג+ד+ה) — the cohort's
// accumulated wisdom in one place, HOSTED BY THE REFERENT (stage ג: he's the
// community voice; the King stays the official-knowledge curator).
//
// Honesty rules carried over: everything shown cleared the k-anonymity bars
// (ratings N≥3, grades N≥5); "דבר הרפרנט" is pure counting, never an LLM
// guess; empty states invite seeding instead of faking life. The knowledge
// is deliberately cross-cohort — it outlives every graduating class
// (stage ה: inheritance is automatic because nothing filters by year).
// =========================================================================

import { useLocale } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Users,
  ThumbsUp,
  Gauge,
  Flame,
  Share2,
  Sprout,
  MessageSquareQuote,
  Lightbulb,
  Flag,
  Send,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { PersonaCharacter, usePersona } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";
import { courseColor } from "@/lib/course-color";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { CohortShareNudge } from "@/components/cohort/cohort-share-nudge";
import { encodePlan, type SharedCourse } from "@/lib/plan-share";
import { contributorLevel } from "@/lib/contributor-level";
import { cohortLabel } from "@/lib/cohort-label";
import { LineagePactStrip } from "@/components/lineage/lineage-pact";
import { LineageFirstContribution } from "@/components/lineage/lineage-first-contribution";
import { heNoun, heNounF } from "@/lib/he-count";

export function CohortFileContent() {
  const locale = useLocale();
  const isHe = locale === "he";
  const digestQuery = api.courseKnowledge.getCohortDigest.useQuery();
  // Hooks BEFORE any early return — a conditional hook order crashes React.
  const profileQuery = api.user.getProfile.useQuery();
  // The cohort file is HOSTED by the advisor. It used to be the Referent for
  // everyone, which is precisely the "here the King, there the Referent"
  // incoherence — there is one advisor in this app, and the student picked it.
  const { persona } = usePersona();
  const advisor = personaLabels(persona, isHe);
  const [electivesOnly, setElectivesOnly] = useState(false);

  if (digestQuery.isLoading) return <ThemedLoader />;
  // Honest error state — a fetch failure must NOT fall through to the
  // "no wisdom yet / be the first to share" empty state, which would assert
  // there's no data when we simply couldn't load it (audit 22.7).
  if (digestQuery.isError) {
    return (
      <div className="bg-mesh flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-foreground/70">
          {isHe ? "לא הצלחנו לטעון את חוכמת-המחזור כרגע." : "We couldn't load cohort wisdom right now."}
        </p>
        <button
          type="button"
          onClick={() => digestQuery.refetch()}
          className="rounded-lg bg-accent-brand px-4 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
        >
          {isHe ? "נסו שוב" : "Try again"}
        </button>
      </div>
    );
  }

  const digest = digestQuery.data;
  const totals = digest?.totals;
  const hasData = (digest?.courses.length ?? 0) > 0;
  const visibleCourses = (digest?.courses ?? []).filter(
    (c) => !electivesOnly || c.courseType === "ELECTIVE",
  );

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* Header — the student's OWN advisor hosts (it used to be the Referent
          for everyone, so a King user met a second character here). The file is
          one half of השושלת (#41), so it says which whole it belongs to
          instead of floating on its own. */}
      <div className="animate-stagger-1 space-y-2">
        <Link
          href="/lineage"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/45 transition-colors hover:text-foreground/75"
        >
          {isHe ? "השושלת" : "The Lineage"}
          <ChevronLeft className="size-3.5 ltr:rotate-180" />
        </Link>
        <div className="flex items-start gap-4">
          <PersonaCharacter className="size-14 shrink-0 drop-shadow-sm" />
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground/85">
              {isHe ? "תיק המחזור" : "The cohort file"}
            </h1>
            <p className="mt-1 text-foreground/55">
              {isHe
                ? `${advisor.short} מארח: מה שהמחזורים שלפניכם למדו בדם — שמור, אנונימי, ועובר הלאה.`
                : `Hosted by ${advisor.short}: what the cohorts before you learned the hard way — kept, anonymous, passed on.`}
            </p>
            <LineagePactStrip className="mt-2 max-w-2xl" />
          </div>
        </div>
      </div>

      {/* The game layer — my contributor level, always visible, always a
          next step. Counting only; no fake points. */}
      <LevelChip isHe={isHe} />

      {/* דבר היועץ — data-driven, counting only */}
      <div className="animate-stagger-2 data-card flex flex-wrap items-center gap-3 p-4">
        <MessageSquareQuote className="size-5 shrink-0 text-accent-brand" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/75">
          {/* "אין כאן כלום" and "יש כאן משהו שעוד לא עבר את הסף" are different
              facts, and the second one was being told as the first: students
              who imported their grades were informed that the file is empty,
              which writes off the contribution they just made. The grade-point
              count is already printed verbatim in the branch below — this only
              stops it from being rounded down to "nothing" (#30). */}
          {!totals || (totals.reviews === 0 && totals.gradePoints === 0)
            ? isHe
              ? "עוד אין כאן חוכמת-מחזור — מישהו צריך להיות ראשון. חוות-דעת אחת שלכם פותחת את התיק לכולם."
              : "No cohort wisdom yet — someone has to go first. One review of yours opens the file for everyone."
            : totals.reviews === 0
              ? isHe
                ? `נאספו כאן כבר ${heNounF(totals.gradePoints, "תרומה", "תרומות")}-ציונים אנונימיות, אבל עוד לא נכתבה אף חוות-דעת — ולכן אין עדיין מה להציג. זה לא ריק, זה מתחת לסף.`
                : `${totals.gradePoints} anonymous grade contributions are already in, but not one review has been written yet — so there's still nothing to show. This isn't empty, it's below the bar.`
            : isHe
              ? `עד עכשיו נאספו כאן ${totals.reviews} חוות-דעת ו-${heNounF(totals.gradePoints, "תרומה", "תרומות")}-ציונים על ${heNoun(totals.coursesCovered, "קורס", "קורסים")}.${totals.mostDiscussed ? ` הקורס המדובר ביותר: ${totals.mostDiscussed.nameHe} (${totals.mostDiscussed.count} חוות-דעת).` : ""}`
              : `${totals.reviews} reviews and ${totals.gradePoints} grade contributions across ${totals.coursesCovered} courses so far.${totals.mostDiscussed ? ` Most discussed: ${totals.mostDiscussed.nameHe} (${totals.mostDiscussed.count} reviews).` : ""}`}
        </p>
      </div>

      {/* One-click contribution path — lower friction than writing a review;
          self-hides once the student has shared or dismissed it. */}
      <CohortShareNudge variant="card" className="animate-stagger-2" />

      {hasData ? (
        <>
          {/* Course wisdom table */}
          <div className="animate-stagger-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground/85">
                <Gauge className="size-5 text-foreground/60" />
                {isHe ? "מה המחזור אומר על הקורסים" : "What the cohort says per course"}
              </h2>
              {/* The elective-picking flow: one tap isolates the choice pool */}
              <button
                type="button"
                onClick={() => setElectivesOnly((v) => !v)}
                aria-pressed={electivesOnly}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  electivesOnly
                    ? "bg-foreground text-background"
                    : "bg-foreground/8 text-foreground/60 hover:bg-foreground/15",
                )}
              >
                {isHe ? "רק קורסי בחירה" : "Electives only"}
              </button>
            </div>
            <div className="data-card overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-start text-xs text-foreground/50">
                    <th className="px-4 py-2.5 text-start font-medium">{isHe ? "קורס" : "Course"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "ממליצים" : "Recommend"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "עומס" : "Workload"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "קושי" : "Difficulty"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "ממוצע המחזור" : "Cohort avg"}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{isHe ? "חוות-דעת" : "Reviews"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visibleCourses.map((c) => {
                    return (
                      <tr key={c.courseCode}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: courseColor(c.courseCode) }}
                            />
                            <span className="font-medium text-foreground/85">
                              {isHe ? c.nameHe : (c.nameEn ?? c.nameHe)}
                            </span>
                            <span className="font-mono text-[11px] text-foreground/35">{c.courseCode}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.recommendShare != null ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                                c.recommendShare >= 0.6
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : "bg-foreground/8 text-foreground/60",
                              )}
                            >
                              <ThumbsUp className="size-3" />
                              {Math.round(c.recommendShare * 100)}%
                            </span>
                          ) : (
                            <span className="text-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70">
                          {c.workload != null ? `${c.workload}/5` : <span className="text-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70">
                          {c.difficulty != null ? `${c.difficulty}/5` : <span className="text-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-foreground/70">
                          {c.cohortAverage != null ? c.cohortAverage : <span className="text-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center text-foreground/55">{c.ratingCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-foreground/40">
              {isHe
                ? "מוצג רק מה שעבר את סף האנונימיות: דירוגים מ-3 מדרגים, ציונים מ-5 תורמים. אף נתון אישי לא נחשף."
                : "Only data above the anonymity bar is shown: ratings from 3+ raters, grades from 5+ contributors. Nothing personal is exposed."}
            </p>
          </div>

          {/* Tips wall */}
          {digest!.tips.length > 0 && (
            <div className="animate-stagger-4 space-y-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground/85">
                <Flame className="size-5 text-foreground/60" />
                {isHe ? "טיפים מהשטח" : "Tips from the field"}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {digest!.tips.map((t, i) => (
                  <div key={i} className="data-card space-y-1.5 p-4">
                    <p className="text-sm leading-relaxed text-foreground/80">{t.tip}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/45">
                      <span>{t.courseName}</span>
                      {/* #41 — how far ahead of you the writer was. The server
                          only sends a year when that cohort is crowded enough
                          to hide the individual (safeCohortYear). */}
                      {t.cohortYear != null && (
                        <span className="text-foreground/35">
                          {cohortLabel(t.cohortYear, profileQuery.data?.startYear, isHe)}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Seeding empty state — honest, inviting, no fake life. #31: it used to
           say "דרגו אותו בתיק האקדמי" and link to /record, which carries no
           rating control; the rating list itself is the CTA now. */
        <div className="animate-stagger-3 space-y-3">
          <div className="data-card flex flex-col items-center gap-2 p-8 text-center">
            <Sprout className="size-10 text-foreground/25" />
            <p className="max-w-md text-sm leading-relaxed text-foreground/60">
              {isHe
                ? "התיק נפתח ברגע שיש מספיק תרומות כדי לשמור על אנונימיות (3 מדרגים לקורס). סיימתם קורס? דרגו אותו כאן ותפתחו את הידע לכל המחזור."
                : "The file opens once enough contributions clear the anonymity bar (3 raters per course). Finished a course? Rate it here and unlock the knowledge for the whole cohort."}
            </p>
          </div>
          <LineageFirstContribution />
        </div>
      )}

      {/* Stage ב (approved): "מה הייתי אומר לעצמי" — the insights wall */}
      <InsightsSection isHe={isHe} />

      {/* Winning plans (stage ד) + inheritance note (stage ה) */}
      <div className="animate-stagger-5 grid gap-4 md:grid-cols-2">
        <GallerySection isHe={isHe} />
        <div className="data-card space-y-2 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-foreground/80">
            <Users className="size-4 text-accent-brand" />
            {isHe ? "הידע עובר הלאה" : "Knowledge passes on"}
          </h3>
          <p className="text-sm leading-relaxed text-foreground/60">
            {isHe
              ? "כל מה שנאסף כאן נשאר גם אחרי שהמחזור שלכם מסיים — המחזור הבא מתחיל עם כל מה שלמדתם. זה כל הרעיון."
              : "Everything gathered here outlives your cohort — the next one starts with everything you learned. That's the whole point."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Stage ב: the insights wall ("מה הייתי אומר לעצמי") ────────────────
const STAGES = [
  { key: "FIRST_YEAR", he: "לשנה א׳", en: "To first-years" },
  { key: "BIDDING", he: "לפני בידינג", en: "Before bidding" },
  { key: "EXAMS", he: "לפני מבחנים", en: "Before exams" },
  { key: "FOCUS", he: "בחירת מיקוד", en: "Picking a focus" },
  { key: "GENERAL", he: "כללי", en: "General" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

function InsightsSection({ isHe }: { isHe: boolean }) {
  const utils = api.useUtils();
  const listQuery = api.cohort.listInsights.useQuery();
  const mineQuery = api.cohort.myInsights.useQuery();
  const profileQuery = api.user.getProfile.useQuery();
  const [stage, setStage] = useState<StageKey>("FIRST_YEAR");
  // null = "no local edit yet, show the saved text"; "" = user cleared it.
  const [draft, setDraft] = useState<string | null>(null);

  const contribute = api.cohort.contributeInsight.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "התובנה נשמרה — תודה! המחזור הבא כבר מרוויח" : "Saved — thank you!");
      setDraft(null);
      void utils.cohort.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const report = api.cohort.reportInsight.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "דווח — תודה" : "Reported");
      void utils.cohort.listInsights.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMine = api.cohort.deleteMyInsight.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "התובנה נמחקה" : "Deleted");
      setDraft(null);
      void utils.cohort.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const byStage = useMemo(() => {
    const m = new Map<string, NonNullable<typeof listQuery.data>>();
    for (const row of listQuery.data ?? []) {
      const list = m.get(row.stage) ?? [];
      list.push(row);
      m.set(row.stage, list);
    }
    return m;
  }, [listQuery.data]);

  const mine = mineQuery.data?.find((x) => x.stage === stage);
  const rows = byStage.get(stage) ?? [];

  return (
    <div className="animate-stagger-4 space-y-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground/85">
        <Lightbulb className="size-5 text-foreground/60" />
        {isHe ? "מה הייתי אומר לעצמי" : "What I'd tell myself"}
      </h2>

      {/* Stage tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((st) => (
          <button
            key={st.key}
            type="button"
            onClick={() => { setStage(st.key); setDraft(null); }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              stage === st.key
                ? "bg-foreground text-background"
                : "bg-foreground/8 text-foreground/60 hover:bg-foreground/15",
            )}
          >
            {isHe ? st.he : st.en}
          </button>
        ))}
      </div>

      {/* The wall */}
      {rows.length === 0 ? (
        <p className="text-sm text-foreground/45">
          {isHe ? "עוד אין תובנות בשלב הזה — שלכם יכולה להיות הראשונה." : "No insights here yet — yours could be the first."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="data-card group space-y-1.5 p-4">
              <p className="text-sm leading-relaxed text-foreground/80">{r.text}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/40">
                  {cohortLabel(r.cohortYear, profileQuery.data?.startYear, isHe)}
                </span>
                <button
                  type="button"
                  onClick={() => report.mutate({ id: r.id })}
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={isHe ? "דיווח על תוכן פוגעני" : "Report"}
                >
                  <Flag className="size-3.5 text-foreground/30 hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contribute box — one per stage, editable */}
      <div className="data-card space-y-2 p-4">
        <p className="text-sm font-medium text-foreground/70">
          {isHe
            ? mine ? "התובנה שלכם בשלב הזה (עריכה מחליפה):" : "מה הייתם אומרים לעצמכם? (אנונימי, משפט-שניים)"
            : mine ? "Your insight for this stage (editing replaces):" : "What would you tell yourself? (anonymous)"}
        </p>
        {(() => {
          const shown = draft ?? mine?.text ?? "";
          return (
            <div className="flex flex-wrap gap-2">
              <input
                value={shown}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={400}
                placeholder={isHe ? "למשל: אל תיקחו 3 קורסי כלכלה באותו סמסטר…" : "e.g. don't stack 3 econ courses…"}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none"
                aria-label={isHe ? "תובנה למחזור" : "Insight"}
              />
              <button
                type="button"
                disabled={shown.trim().length < 10 || contribute.isPending}
                onClick={() => contribute.mutate({ stage, text: shown.trim() })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
              >
                <Send className="size-3.5" />
                {isHe ? "שיתוף" : "Share"}
              </button>
              {mine && (
                <button
                  type="button"
                  onClick={() => deleteMine.mutate({ stage })}
                  className="rounded-lg bg-foreground/8 px-3 py-2 text-sm font-medium text-foreground/55 transition-colors hover:bg-red-500/15 hover:text-red-500"
                >
                  {isHe ? "מחיקה" : "Delete"}
                </button>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Stage ד: the winning-plans gallery ────────────────────────────────
function GallerySection({ isHe }: { isHe: boolean }) {
  const utils = api.useUtils();
  const galleryQuery = api.cohort.listGallery.useQuery();
  const planQuery = api.plan.getUserPlan.useQuery();
  const profileQuery = api.user.getProfile.useQuery();
  const [title, setTitle] = useState("");

  const publish = api.cohort.publishPlan.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "המסלול פורסם לתיק המחזור!" : "Published to the cohort file!");
      setTitle("");
      void utils.cohort.listGallery.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const reportEntry = api.cohort.reportGalleryEntry.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "דווח — תודה" : "Reported");
      void utils.cohort.listGallery.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const unpublish = api.cohort.unpublishMyPlan.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "המסלול הוסר" : "Unpublished");
      void utils.cohort.listGallery.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const publishMyPlan = () => {
    const courses = (planQuery.data?.courses ?? [])
      .filter((uc) => uc.course?.code)
      .map((uc) => ({ c: uc.course.code, y: uc.plannedYear, s: uc.plannedSemester } as SharedCourse));
    if (courses.length === 0) {
      toast.info(isHe ? "אין עדיין תוכנית לפרסם — בנו אחת במתכנן" : "No plan to publish yet");
      return;
    }
    publish.mutate({ title: title.trim(), token: encodePlan(courses) });
  };

  return (
    <div className="data-card space-y-3 p-5">
      <h3 className="flex items-center gap-2 font-semibold text-foreground/80">
        <Share2 className="size-4 text-accent-brand" />
        {isHe ? "מסלולים מנוצחים" : "Winning plans"}
      </h3>

      {(galleryQuery.data?.length ?? 0) > 0 ? (
        <ul className="space-y-2">
          {galleryQuery.data!.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground/80">{e.title}</p>
                <p className="text-xs text-foreground/40">
                  {e.cohortYear ? cohortLabel(e.cohortYear, profileQuery.data?.startYear, isHe) : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/shared-plan?d=${encodeURIComponent(e.token)}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-accent-brand/10 px-2.5 py-1.5 text-xs font-semibold text-accent-brand hover:bg-accent-brand/20"
                >
                  <ExternalLink className="size-3" />
                  {isHe ? "צפייה והעתקה" : "View & copy"}
                </Link>
                <button
                  type="button"
                  onClick={() => reportEntry.mutate({ id: e.id })}
                  aria-label={isHe ? "דיווח על מסלול" : "Report plan"}
                  className="rounded-lg p-1.5 text-foreground/30 hover:text-red-500"
                >
                  <Flag className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-foreground/55">
          {isHe
            ? "עוד אין מסלולים בגלריה — פרסמו את שלכם וקבעו את הרף."
            : "No plans in the gallery yet — publish yours and set the bar."}
        </p>
      )}

      {/* Publish mine */}
      <div className="flex gap-2 border-t border-border/40 pt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder={isHe ? "שם למסלול שלכם (למשל: שנה ב׳ מאוזנת)" : "Name your plan"}
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/30 focus:outline-none"
          aria-label={isHe ? "שם המסלול" : "Plan title"}
        />
        <button
          type="button"
          disabled={title.trim().length < 3 || publish.isPending}
          onClick={publishMyPlan}
          className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
        >
          {isHe ? "פרסום המסלול שלי" : "Publish my plan"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => unpublish.mutate()}
        className="text-xs text-foreground/40 transition-colors hover:text-foreground/70"
      >
        {isHe ? "הסרת המסלול שפרסמתי" : "Remove my published plan"}
      </button>
    </div>
  );
}

// ─── The game layer: contributor level chip ────────────────────────────
function LevelChip({ isHe }: { isHe: boolean }) {
  const stats = api.cohort.myContributionStats.useQuery();
  if (!stats.data) return null;
  const lvl = contributorLevel(stats.data.total);
  return (
    <div className="animate-stagger-2 data-card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground/80">
          {isHe ? `הדרגה שלכם בתיק: ${lvl.titleHe}` : `Your file rank: ${lvl.titleEn}`}
          <span className="font-normal text-foreground/45">
            {isHe ? ` (${heNounF(stats.data.total, "תרומה", "תרומות")})` : ` (${stats.data.total} contributions)`}
          </span>
        </p>
        {lvl.nextAt !== null ? (
          <>
            <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-accent-brand transition-all"
                style={{ width: `${Math.round(lvl.progress * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-foreground/45">
              {isHe
                ? (lvl.nextAt - stats.data.total === 1
                    ? "עוד תרומה אחת לדרגה הבאה — חוות-דעת, תובנה או מסלול."
                    : `עוד ${heNounF(lvl.nextAt - stats.data.total, "תרומה", "תרומות")} לדרגה הבאה — חוות-דעת, תובנה או מסלול.`)
                : `${lvl.nextAt - stats.data.total} more to the next rank — a review, an insight or a plan.`}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-foreground/45">
            {isHe ? "הדרגה הגבוהה ביותר — המחזור חייב לכם." : "Top rank — the cohort owes you."}
          </p>
        )}
      </div>
    </div>
  );
}
