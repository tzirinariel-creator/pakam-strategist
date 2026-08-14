"use client";

// =========================================================================
// השושלת — the one home of everything social (#41, #18, #34).
// =========================================================================
// Ariel: "יש תיק מחזור, יש חונכות… למה לא לאחד את כל הקונספט החברתי עם איזה שם
// מגניב וקשור וליצור דורות עתידיים מוצלחים".
//
// The two surfaces were never really two features — they are two AXES:
//   • תיק המחזור  = knowledge across TIME. Anonymous, aggregate, permanent.
//   • חונכות      = help between PEOPLE. Named, consented, revocable.
// They were sitting in the sidebar as two peers with the same icon and no
// stated relationship, so the split read as arbitrary. This page names the
// whole thing (השושלת), shows where the student sits in the chain of cohorts,
// states the sharing contract once (#34), and hands off to each surface with
// its "who sees what" printed on the door.
//
// Deliberately NOT here: any roster, directory, or list of who is in the
// cohort. That is an owner decision — see docs/מחקר-הקונספט-החברתי.md.

import { useLocale } from "next-intl";
import { ArrowLeft, ArrowRight, Users2, Handshake, History, Sprout, Milestone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { PersonaCharacter } from "@/components/persona/use-persona";
import { LineagePact } from "@/components/lineage/lineage-pact";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { QueryErrorState } from "@/components/shared/query-error";
import { generationSpan, hasContributed } from "@/lib/lineage";
import { contributorLevel } from "@/lib/contributor-level";

export function LineageContent() {
  const isHe = useLocale() === "he";
  const Arrow = isHe ? ArrowLeft : ArrowRight;

  const digest = api.courseKnowledge.getCohortDigest.useQuery();
  const insights = api.cohort.listInsights.useQuery();
  const gallery = api.cohort.listGallery.useQuery();
  const profile = api.user.getProfile.useQuery();
  const stats = api.cohort.myContributionStats.useQuery();

  // Distinct cohort years only — never per-year counts (that would name the
  // lone contributor). Every year here is already painted on the cards these
  // lists render, so this adds no new surface.
  const years = [
    ...(digest.data?.cohortYearsPresent ?? []),
    ...(insights.data ?? []).map((i) => i.cohortYear),
    ...(gallery.data ?? []).map((g) => g.cohortYear),
  ];
  const span = generationSpan(years, profile.data?.startYear ?? null);
  const mine = stats.data ?? null;
  const iContributed = hasContributed(mine);
  const level = mine ? contributorLevel(mine.total) : null;

  // Every query above degrades with `?? []` / `?? null`, which is right for a
  // PARTIAL failure but became a lie on a TOTAL one: a student with 40
  // contributions was told "you haven't contributed yet" and "you're at the
  // start of the lineage" whenever the fetch failed. The lineage's whole promise
  // is that what you give stays — so it must never claim you gave nothing
  // because a request timed out (audit 13.8).
  const lineageFailed =
    digest.isError && insights.isError && gallery.isError && stats.isError;
  const lineageLoading =
    digest.isLoading || insights.isLoading || gallery.isLoading || stats.isLoading;

  if (lineageFailed) {
    return (
      <div className="bg-mesh p-4 md:p-6">
        <QueryErrorState
          what={isHe ? "השושלת" : "the lineage"}
          onRetry={() => {
            void digest.refetch();
            void insights.refetch();
            void gallery.refetch();
            void profile.refetch();
            void stats.refetch();
          }}
        />
      </div>
    );
  }

  if (lineageLoading) {
    return (
      <div className="bg-mesh p-4 md:p-6">
        <ThemedLoader />
      </div>
    );
  }

  return (
    <div className="bg-mesh space-y-8 p-4 md:p-6">
      {/* ── Who we are ─────────────────────────────────────────────── */}
      <header className="animate-stagger-1 flex items-start gap-4">
        <PersonaCharacter className="size-14 shrink-0 drop-shadow-sm" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-foreground/85">
            {isHe ? "השושלת" : "The Lineage"}
          </h1>
          <p className="mt-1 max-w-2xl leading-relaxed text-foreground/55">
            {isHe
              ? "מחזור אחד לומד משהו בדרך הקשה, מסיים, והידע נעלם איתו. השושלת היא הניסיון להפסיק את זה: מה שאתם יודעים נשאר כאן, למי שיבוא אחריכם — בדיוק כמו שמה שיודעים מי שלפניכם מחכה לכם עכשיו."
              : "One cohort learns something the hard way, graduates, and the knowledge leaves with them. The Lineage is the attempt to stop that: what you know stays here for whoever comes next — exactly as what the cohorts before you knew is waiting for you now."}
          </p>
        </div>
      </header>

      {/* ── The generations — where I sit in the chain ───────────────── */}
      <section className="animate-stagger-2 space-y-3">
        <h2 className="font-display text-xl font-bold text-foreground/85">
          {isHe ? "שלושה דורות" : "Three generations"}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <GenerationCard
            icon={History}
            title={isHe ? "מי שלפניכם" : "Those before you"}
            body={
              isHe
                ? "המחזורים שכבר עברו את הקורסים שאתם מתלבטים עליהם. הדירוגים, הטיפים והמסלולים שלהם כבר בפנים."
                : "The cohorts that already took the courses you're weighing. Their ratings, tips and plans are already inside."
            }
            stat={
              span.before > 0
                ? isHe
                  ? span.before === 1
                    ? "מחזור אחד לפניכם כבר תרם כאן"
                    : `${span.before} מחזורים לפניכם כבר תרמו כאן`
                  : `${span.before} earlier ${span.before === 1 ? "cohort has" : "cohorts have"} contributed`
                : isHe
                  ? "עוד אין כאן מחזור שקדם לכם — אתם בתחילת השושלת"
                  : "No earlier cohort here yet — you're at the start of the lineage"
            }
          />
          <GenerationCard
            icon={Milestone}
            highlight
            title={isHe ? "אתם" : "You"}
            body={
              isHe
                ? "כל קורס שאתם מסיימים הוא נתון שחסר למישהו. חוות-דעת אחת לוקחת דקה, ונשארת שימושית שנים."
                : "Every course you finish is a data point someone is missing. One review takes a minute and stays useful for years."
            }
            stat={
              iContributed && mine && level
                ? isHe
                  ? `${mine.total} תרומות שלכם · ${level.titleHe}`
                  : `${mine.total} contributions · ${level.titleEn}`
                : isHe
                  ? "עוד לא תרמתם כלום — וזה בסדר, אפשר להתחיל בקורס אחד"
                  : "You haven't contributed yet — one course is enough to start"
            }
          />
          <GenerationCard
            icon={Sprout}
            title={isHe ? "מי שאחריכם" : "Those after you"}
            body={
              isHe
                ? "התיק לא נמחק ביום שאתם מסיימים. המחזור הבא נכנס למקום שאליו הגעתם, לא לאפס."
                : "The file isn't wiped the day you graduate. The next cohort starts where you got to, not from zero."
            }
            stat={
              span.after > 0
                ? isHe
                  ? span.after === 1
                    ? "מחזור אחד אחריכם כבר בפנים"
                    : `${span.after} מחזורים אחריכם כבר בפנים`
                  : `${span.after} later ${span.after === 1 ? "cohort is" : "cohorts are"} already in`
                : isHe
                  ? "עוד לא הגיע מחזור אחריכם — מה שתשאירו יחכה להם"
                  : "No later cohort has arrived — what you leave will be waiting"
            }
          />
        </div>
      </section>

      {/* ── The two doors ──────────────────────────────────────────── */}
      <section className="animate-stagger-3 space-y-3">
        <h2 className="font-display text-xl font-bold text-foreground/85">
          {isHe ? "שתי הדרכים לעזור ולהיעזר" : "Two ways to help and be helped"}
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/55">
          {isHe
            ? "הן נראות דומות ומתנהגות הפוך, ולכן הן נפרדות: אחת עובדת בלי שמות בכלל, השנייה עובדת רק עם שם ורק בהזמנה שלכם."
            : "They look alike and behave in opposite ways, which is why they're separate: one works with no names at all, the other only with a name and only by your invitation."}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <DoorCard
            href="/cohort"
            icon={Users2}
            arrow={Arrow}
            title={isHe ? "תיק המחזור" : "The cohort file"}
            kicker={isHe ? "ידע אנונימי, חוצה מחזורים" : "Anonymous knowledge, across cohorts"}
            body={
              isHe
                ? "ממוצעים אמיתיים, עומס וקושי, טיפים לפי קורס, תובנות ומסלולים מנוצחים."
                : "Real averages, workload and difficulty, tips per course, insights and winning plans."
            }
            seeing={
              isHe
                ? "מי רואה מה: כולם רואים את המספרים ואת הטקסטים. אף אחד לא רואה מי כתב אותם, כולל אנחנו."
                : "Who sees what: everyone sees the numbers and the texts. Nobody sees who wrote them, us included."
            }
            cta={isHe ? "לתיק המחזור" : "Open the file"}
          />
          <DoorCard
            href="/mentors"
            icon={Handshake}
            arrow={Arrow}
            title={isHe ? "חונכות" : "Mentoring"}
            kicker={isHe ? "קשר אישי, בהסכמה, בשם" : "A named link, by consent"}
            body={
              isHe
                ? "מזמינים סטודנט/ית שסומכים עליהם להסתכל על תוכנית-התואר ולייעץ עליה."
                : "Invite someone you trust to look at your degree plan and advise on it."
            }
            seeing={
              isHe
                ? "מי רואה מה: רק מי שהזמנתם, ורק קורסים וסמסטרים. ציונים לעולם לא עוברים, וניתוק סוגר את הגישה מיד."
                : "Who sees what: only who you invited, and only courses and semesters. Grades never pass, and ending the link closes access immediately."
            }
            cta={isHe ? "לחונכות" : "Open mentoring"}
          />
        </div>
      </section>

      {/* ── The contract, once (#34) ───────────────────────────────── */}
      <div className="animate-stagger-4">
        <LineagePact />
      </div>

      {/* ── Where to start ─────────────────────────────────────────── */}
      <section className="animate-stagger-5 data-card space-y-2 p-5">
        <h2 className="font-display text-lg font-bold text-foreground/85">
          {isHe ? "איפה מתחילים" : "Where to start"}
        </h2>
        <p className="text-sm leading-relaxed text-foreground/60">
          {isHe
            ? "הדרך הקצרה ביותר להיכנס לשושלת: פתחו את התיק האקדמי ודרגו קורס אחד שכבר סיימתם. זה דקה, וזה מה שפותח את הנתונים לכל השאר."
            : "The shortest way in: open your academic record and rate one course you've already finished. It takes a minute, and it's what unlocks the data for everyone else."}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/record"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-4 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
          >
            {isHe ? "לתיק האקדמי שלי" : "To my record"}
            <Arrow className="size-3.5" />
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/8 px-4 py-2 text-sm font-medium text-foreground/65 transition-colors hover:bg-foreground/15"
          >
            {isHe ? "לניהול ומשיכת התרומות שלי" : "Manage or withdraw my contributions"}
          </Link>
        </div>
      </section>
    </div>
  );
}

function GenerationCard({
  icon: Icon,
  title,
  body,
  stat,
  highlight = false,
}: {
  icon: typeof History;
  title: string;
  body: string;
  stat: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "data-card flex flex-col gap-2 p-5",
        highlight && "ring-1 ring-accent-brand/35",
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            highlight ? "bg-accent-brand/12 text-accent-brand" : "bg-foreground/[0.06] text-foreground/60",
          )}
        >
          <Icon className="size-4" />
        </div>
        <h3 className="font-semibold text-foreground/85">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-foreground/65">{body}</p>
      <p className="mt-auto border-t border-border/40 pt-2 text-xs font-medium text-foreground/50">
        <Bidi text={stat} />
      </p>
    </div>
  );
}

function DoorCard({
  href,
  icon: Icon,
  arrow: Arrow,
  title,
  kicker,
  body,
  seeing,
  cta,
}: {
  href: string;
  icon: typeof Users2;
  arrow: React.ComponentType<{ className?: string }>;
  title: string;
  kicker: string;
  body: string;
  seeing: string;
  cta: string;
}) {
  return (
    <div className="data-card flex flex-col gap-2.5 p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-foreground/85">{title}</h3>
          <p className="text-xs font-medium text-foreground/50">{kicker}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-foreground/65">{body}</p>
      <p className="rounded-lg bg-foreground/[0.04] p-3 text-xs leading-relaxed text-foreground/60">
        {seeing}
      </p>
      <Link
        href={href}
        className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
      >
        {cta}
        <Arrow className="size-3.5" />
      </Link>
    </div>
  );
}
