"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  GraduationCap,
  Calendar,
  BarChart3,
  BookOpen,
  Scale,
  FileText,
  ArrowLeft,
  ArrowRight,
  Check,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { cn } from "@/lib/utils";
import { CATALOG_COURSE_COUNT, CONTACT_EMAIL, CREDIT_REQUIREMENTS, FOCUS_DISCIPLINE_IDS } from "@/lib/constants";
import { getBiddingPhase, isBiddingRelevant } from "@/lib/bidding-calendar";
import { heNoun } from "@/lib/he-count";

// ─── Feature Card Data ──────────────────────────────────────────────
// The King has his own dedicated dark band above the grid; the grid holds the
// six concrete tools. Colors are the harmonized discipline hues — never a lone
// acid accent.

// Ariel note #1, the landing page reading as a student project. Six feature
// icons in five hardcoded hex colours — blue, purple, blue, green, red, teal —
// none of which meant anything: two features shared a blue for no reason, and
// nothing anywhere else in the product maps a feature to a hue. Colour that
// encodes nothing is the loudest signal on a page trying to look serious.
//
// The course chips further down KEEP their colours, because those are
// discipline colours and they do carry information. One accent, used where it
// means something.
const FEATURES = [
  { key: "planner", icon: GraduationCap },
  { key: "catalog", icon: BookOpen },
  { key: "calendar", icon: Calendar },
  { key: "grades", icon: BarChart3 },
  { key: "regulations", icon: Scale },
  { key: "syllabus", icon: FileText },
] as const;

// ─── Product Preview (a styled mini-planner — "show, don't tell") ────

const PREVIEW_SEMESTERS = [
  {
    he: "שנה א׳",
    en: "Year 1",
    courses: [
      { he: "מבוא ללוגיקה", en: "Intro to Logic", color: "var(--course-color-0)", credits: 4 },
      { he: "מיקרו כלכלה א׳", en: "Microecon I", color: "var(--course-color-2)", credits: 5 },
    ],
  },
  {
    he: "שנה ב׳",
    en: "Year 2",
    courses: [
      { he: "פילוסופיה פוליטית", en: "Political Phil.", color: "var(--course-color-10)", credits: 4 },
      { he: "פוליטיקה השוואתית", en: "Comparative Pol.", color: "var(--course-color-5)", credits: 4 },
    ],
  },
  {
    he: "שנה ג׳",
    en: "Year 3",
    courses: [
      { he: "חקיקה ורגולציה", en: "Legislation", color: "var(--course-color-1)", credits: 4 },
      { he: "סמינר פכ״מ", en: "PPE Seminar", color: "var(--course-color-9)", credits: 4 },
    ],
  },
] as const;

function PlannerPreview({ isRTL }: { isRTL: boolean }) {
  return (
    <div
      aria-hidden
      className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-float"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-3">
        <div className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <GraduationCap className="size-3" />
          <span>{isRTL ? "תכנון התואר" : "Degree planner"}</span>
        </div>
      </div>

      {/* Credit progress */}
      <div className="px-4 pt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
          <span className="font-semibold text-foreground">
            <bdi dir="ltr">33 / 150</bdi>{" "}
            <span className="text-muted-foreground">{isRTL ? "ש״ס" : "credits"}</span>
          </span>
          <span className="tabular text-muted-foreground">
            <bdi dir="ltr">22%</bdi>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[22%] rounded-full bg-foreground" />
        </div>
      </div>

      {/* Mini planner grid */}
      <div className="grid grid-cols-3 gap-2 p-4">
        {PREVIEW_SEMESTERS.map((sem) => (
          <div key={sem.en}>
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              {isRTL ? sem.he : sem.en}
            </div>
            <div className="space-y-1.5">
              {sem.courses.map((c) => (
                <div
                  key={c.en}
                  className="rounded-md border border-border/50 border-s-2 bg-background px-2 py-1.5"
                  style={{ borderInlineStartColor: c.color }}
                >
                  {/* Two lines, not a cut. Measured at 375px: "פוליטיקה
                      השוואתית" needs 90px of the 79 these three columns leave
                      it, so the mock that is meant to show the product working
                      showed a course name ending in an ellipsis. */}
                  <div className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/90">
                    {isRTL ? c.he : c.en}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.credits} {isRTL ? "ש״ס" : "cr"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer chip — compliance */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Scale className="size-3" />
          {isRTL ? "תקנון" : "Regulations"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-status-green">
          <Check className="size-3" />
          {isRTL ? "עומד בתקנון" : "Compliant"}
        </span>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function LandingPage() {
  const t = useTranslations("landing");
  const locale = useLocale();
  const isRTL = locale === "he";
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  // הרצועה בעברית בלבד: הקהל הוא סטודנטי פכ״מ בת״א, והנוסח האנגלי היה
  // תרגום של משפט שאיש לא קורא. `/en` ממילא מפנה לעברית בכוונה.
  const biddingPhase = isRTL ? getBiddingPhase() : { kind: "after" as const, daysUntil: null };
  // משפט לכל מצב, מתוך התאריכים בלבד. "פתוח עכשיו" הוא הדחוף שבהם, והוא
  // דווקא זה שלא הופיע קודם.
  const biddingDays = biddingPhase.daysUntil;
  const biddingRound = (biddingPhase as { round?: number }).round ?? 1;
  const biddingLabel =
    biddingPhase.kind === "before"
      ? biddingDays === 0
        ? `מקצה ${biddingRound} נפתח היום`
        : `מקצה ${biddingRound} נפתח בעוד ${heNoun(biddingDays!, "יום", "ימים")}`
      : biddingPhase.kind === "open"
        ? biddingDays === 0
          ? `מקצה ${biddingRound} נסגר היום`
          : `מקצה ${biddingRound} פתוח — נסגר בעוד ${heNoun(biddingDays!, "יום", "ימים")}`
        : biddingPhase.kind === "awaiting-results"
          ? biddingDays === 0
            ? `תוצאות מקצה ${biddingRound} מתפרסמות היום`
            : `תוצאות מקצה ${biddingRound} בעוד ${heNoun(biddingDays!, "יום", "ימים")}`
          : biddingPhase.kind === "between-rounds"
            ? biddingDays === 0
              ? `מקצה ${biddingRound} נפתח היום`
              : `מקצה ${biddingRound} נפתח בעוד ${heNoun(biddingDays!, "יום", "ימים")}`
            : null;

  const stats = [
    // Pinned to the real תשפ״ז catalog by a guard test — it read "110+" for
    // months after the migration took the catalog to 302.
    { value: String(CATALOG_COURSE_COUNT), label: t("stats.courses") },
    // "3" and "150" were string literals sitting next to a number that is
    // pinned — the same bug the comment above warns about, two lines below it.
    // Both now read off the active program definition, so the front page cannot
    // disagree with the planner behind it (tau-law-2025, for one, is 141 ש״ס).
    { value: String(FOCUS_DISCIPLINE_IDS.length), label: t("stats.disciplines") },
    { value: String(CREDIT_REQUIREMENTS.TOTAL), label: t("stats.credits") },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navigation Bar ───────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#312E81] shadow-sm">
              <PhilosopherKingIcon className="size-5 text-crown-gold-bright" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {t("brand")}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button
              size="sm"
              asChild
            >
              <Link href="/signup">{t("signup")}</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ─────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 md:py-24">
        {/* Background depth — the King's regal indigo + gold, kept faint so the
            content leads. A hairline grid fades toward the top edge. */}
        <div className="bg-mesh pointer-events-none absolute inset-0">
          <div className="absolute start-1/4 top-0 size-[28rem] rounded-full bg-accent-brand/[0.06] blur-3xl" />
          <div className="absolute end-1/4 bottom-0 size-80 rounded-full bg-crown-gold/[0.05] blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)",
              WebkitMaskImage:
                "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)",
            }}
          />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* Text column */}
          <div className="animate-rise text-center lg:text-start">
            {/* =========================================
                הבידינג — הסיבה שסטודנט פכ״מ נכנס דווקא השבוע
                =========================================
                ביקורת השיווק שעשיתי בעצמי, 3.9: דף הנחיתה לא מזכיר בידינג
                באף מילה. חיפשתי "בידינג", "מכרז", "מקצה" ו"רישום לקורסים"
                בכל טקסטי הדף — אפס. וזה הדבר האחד שדחוף עכשיו: מקצה 1
                נפתח ב-7.9, כלומר בתוך ימים. סטודנט שמגיע לדף ורואה רק
                "תכנון תואר" לא מבין למה לפתוח את זה **היום**.

                הרצועה מופיעה רק כשהמקצה בתוך 30 יום, ונעלמת מעצמה אחריו —
                באנר תמידי הוא קישוט, באנר עם תאריך הוא סיבה. והיא אומרת
                **רק** מה שאנחנו יודעים: תאריך ומה שהאפליקציה עושה. אף
                מילה על ניקוד, כי את המכסות האוניברסיטה לא מפרסמת. */}
            {/* 4.9 — הרצועה נכבתה בדיוק ברגע שהיא הכי נחוצה. התנאי היה
                `kind === "before"`, ובשעה 11:00 ב-7.9 המצב הופך ל-"open"
                והרצועה נעלמת — בשבוע היחיד שבו הקישור באמת רץ מיד ליד.
                וגרוע מזה, זה היה תנאי שנכתב כאן מחדש בזמן שכל שאר
                האפליקציה (דף הבית, התזכורת, time-focus) שואלת את אותה
                שאלה דרך isBiddingRelevant. עכשיו גם כאן.
                המשפט עצמו ממשיך לומר **רק** מה שידוע — תאריך ומה
                שהאפליקציה עושה. אף מילה על ניקוד. */}
            {isBiddingRelevant() && biddingLabel && (
              <div className="mb-4 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-accent-brand/35 bg-accent-brand/[0.07] px-4 py-1.5 text-sm font-medium text-foreground/80 lg:justify-start">
                <CalendarClock className="size-4 shrink-0 text-accent-brand" />
                <span className="font-semibold text-accent-brand">{biddingLabel}</span>
                <span className="text-foreground/65">
                  כאן מתכננים את שני הסמסטרים ורואים חפיפות לפני שמגישים
                </span>
              </div>
            )}

            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-crown-gold/30 bg-card px-4 py-1.5 text-sm font-medium text-foreground/75 shadow-sm">
              <PhilosopherKingIcon className="size-4 text-crown-gold" />
              {t("badge")}
            </div>

            <h1 className="mb-6 text-display-l text-balance text-foreground">
              {t("heroTitle")}
            </h1>

            <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              {/* The count comes from the constant the catalog test pins,
                  not from the sentence. Typed into the string it would go
                  stale on the next catalog migration while the stat strip
                  beside it updated — and the test guarding that number would
                  stay green, because it never reads the prose. */}
              {t("heroSubtitle", { count: CATALOG_COURSE_COUNT })}
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                size="lg"
                className="w-full px-8 sm:w-auto"
                asChild
              >
                <Link href="/signup">
                  {t("ctaStart")}
                  <Arrow className="ms-2 size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full px-8 sm:w-auto" asChild>
                <Link href="/login">{t("ctaLogin")}</Link>
              </Button>
            </div>

            {/* Stat strip — grounding, honest counts (not invented metrics) */}
            <div className="mt-10 flex items-center justify-center gap-6 sm:gap-8 lg:justify-start">
              {stats.map((s, i) => (
                <div key={s.label} className="flex items-center gap-6 sm:gap-8">
                  {i > 0 && <div className="h-9 w-px bg-border" />}
                  <div className="text-center lg:text-start">
                    <div className="tabular font-display text-2xl font-bold text-foreground">
                      <bdi dir="ltr">{s.value}</bdi>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product preview column */}
          <div className="animate-rise relative mx-auto w-full max-w-md [animation-delay:120ms] lg:max-w-none">
            {/* Identity badge floating on the mock — ties the King to the product */}
            <span className="absolute -top-3 z-10 flex size-11 items-center justify-center rounded-2xl bg-[#312E81] shadow-lg ring-1 ring-crown-gold-bright/30 -start-3">
              <PhilosopherKingIcon className="size-6 text-crown-gold-bright" />
            </span>
            <PlannerPreview isRTL={isRTL} />
          </div>
        </div>
      </section>

      {/* ── Proof collage — the argument IS the layout: four crooked "notes"
             (the Yedion, the PDF, the spreadsheet, the WhatsApp group) resolving
             into one straight Pakamon card. True, visual, human. ── */}
      <section className="border-t border-border/50 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mx-auto mb-12 max-w-2xl text-balance text-center font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {t("proofTitle")}
          </h2>
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-6">
            {/* The mess — four tilted, dashed chips */}
            <div className="flex max-w-md flex-wrap items-start justify-center gap-3">
              {([
                { title: t("proof.chip1Title"), body: t("proof.chip1Body"), mono: false },
                { title: t("proof.chip2Title"), body: t("proof.chip2Body"), mono: false },
                { title: t("proof.chip3Title"), body: t("proof.chip3Body"), mono: true },
                { title: t("proof.chip4Title"), body: t("proof.chip4Body"), mono: false },
              ] as const).map((chip) => (
                // Note #1, "childish elements". These were rotated ±1–2° and
                // sprang straight on hover — a scrapbook effect, and a hover
                // behaviour on a decorative chip nobody hovers. The dashed
                // border and muted fill already say "scraps"; the solid,
                // shadowed card after the arrow already says "the answer". The
                // tilt was carrying none of the argument.
                <div
                  key={chip.title}
                  className="w-[calc(50%-0.375rem)] max-w-[220px] rounded-lg border border-dashed border-foreground/25 bg-muted/40 px-3.5 py-3 sm:w-auto"
                >
                  <p className="text-sm font-bold text-foreground/75">{chip.title}</p>
                  {/* No dir="ltr" here: bodies mix Hebrew words with latin/numbers,
                      and the browser's bidi already lays latin runs LTR. Forcing
                      dir="ltr" on Hebrew is wrong (and was a bug). font-mono keeps
                      the "spreadsheet filename" texture on the mono chip. */}
                  <p
                    className={cn(
                      "mt-1 text-xs leading-relaxed text-foreground/65",
                      chip.mono && "font-mono",
                    )}
                  >
                    {chip.body}
                  </p>
                </div>
              ))}
            </div>
            {/* The arrow — points from the mess to the answer */}
            <Arrow className="size-7 shrink-0 rotate-90 text-crown-gold lg:rotate-0" />
            {/* The answer — one straight card with the app's window chrome */}
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
              <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-2.5">
                <div className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PhilosopherKingIcon className="size-3 text-crown-gold" />
                  <span>{t("proof.afterTitle")}</span>
                </div>
              </div>
              <div className="px-5 py-5">
                <p className="text-sm leading-relaxed text-foreground/80">{t("proof.afterBody")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The King strip — the ONE dark band on the page. All text is LIGHT on
             the dark indigo band; every surface below is pinned to FIXED colors
             (not theme tokens) so contrast holds identically in light and dark. */}
      <section
        className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24"
        style={{
          backgroundColor: "var(--king-band)",
          backgroundImage:
            "radial-gradient(120% 130% at 85% -10%, color-mix(in srgb, #6366F1 32%, transparent), transparent 55%), radial-gradient(90% 90% at 5% 110%, color-mix(in srgb, #c99a3b 18%, transparent), transparent 60%)",
        }}
      >
        {/* faint hairline grid for depth on the band */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 90% 80% at 50% 0%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 0%, black, transparent)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="text-center lg:text-start">
            <div className="mx-auto mb-6 flex size-16 items-center justify-center lg:mx-0">
              <PhilosopherKingCharacter className="size-16 drop-shadow-lg" />
            </div>
            {/* The colour is pinned inline ON PURPOSE. globals.css carries an
                UNLAYERED `h1,h2,h3 { color: var(--foreground) }`, and unlayered
                author CSS beats Tailwind's layered utilities — so `text-white`
                here was silently dropped and this heading rendered #18181B on
                the dark indigo band at 1.27:1. Same cascade trap the .data-card
                note in globals.css describes, applied to headings. */}
            <h2
              style={{ color: "#fff" }}
              className="font-display text-2xl font-bold tracking-tight text-balance md:text-4xl"
            >
              {t("king.title")}
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/80 lg:mx-0">
              {t("king.subtitle")}
            </p>
          </div>

          {/* Mock chat — the King's contract voice: answer first, real numbers.
              Window chrome matches the rest of the page; tuned for the dark band. */}
          <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-2xl backdrop-blur-sm">
            <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
              <div className="mx-auto flex items-center gap-1.5 text-xs text-white/70">
                <PhilosopherKingIcon className="size-3 text-crown-gold-bright" />
                <span>{t("brand")}</span>
              </div>
            </div>
            <div className="p-4">
              {/* User question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-white/12 px-3.5 py-2.5 text-sm leading-relaxed text-white">
                  {t("king.chatQ")}
                </div>
              </div>
              {/* King answer — pinned deep-indigo avatar + gold crown = fixed high
                  contrast in BOTH themes (the old bug used theme-flipping tokens). */}
              <div className="mt-3 flex items-start gap-2.5">
                <span
                  className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-crown-gold-bright/40"
                  style={{ backgroundColor: "#312E81" }}
                >
                  <PhilosopherKingIcon className="size-4 text-crown-gold-bright" />
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-ss-md bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900">
                  {t("king.chatA")}
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-white/60">{t("king.chatCaption")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────── */}
      <section className="border-t border-border/50 bg-card/30 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 font-display font-bold text-3xl tracking-tight text-foreground md:text-4xl">
              {t("featuresTitle")}
            </h2>
            <p className="mx-auto max-w-xl text-balance text-muted-foreground">
              {t("featuresSubtitle")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.key}
                  className="group rounded-2xl border border-border/60 bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated"
                >
                  <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent-brand/10">
                    <Icon className="size-5 text-accent-brand" />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg text-foreground">
                    {t(`features.${feature.key}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`features.${feature.key}.desc`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Founder band — quiet, no card; reads like a letter. ── */}
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl border-t border-border/60 pt-10 text-center">
          <p className="eyebrow text-muted-foreground">{t("founder.eyebrow")}</p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
            {t("founder.title")}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/75">
            {t("founder.body")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[t("founder.chip1"), t("founder.chip2"), t("founder.chip3")].map((c) => (
              <span
                key={c}
                className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">{t("founder.meta")}</p>
          <Link
            href="/about"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-brand transition-colors hover:underline"
          >
            {t("founder.link")}
            <Arrow className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────── */}
      <section className="border-t border-border/50 bg-card/30 px-4 py-14 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {t("finalCta.title")}
          </h2>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="w-full px-8 sm:w-auto"
              asChild
            >
              <Link href="/signup">
                {t("ctaStart")}
                <Arrow className="ms-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full px-8 sm:w-auto" asChild>
              <Link href="/login">{t("ctaLogin")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("finalCta.note")}</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-card/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PhilosopherKingIcon className="size-4 text-crown-gold" />
            <span>{t("footer")}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/about" className="transition-colors hover:text-foreground">
              {t("footerAbout")}
            </Link>
            <Link href="/faq" className="transition-colors hover:text-foreground">
              {t("footerFaq")}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              {t("footerPrivacy")}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              {t("footerTerms")}
            </Link>
            {/* The landing page lives outside the (public) route group, so it
                builds its own footer — and that copy had drifted: every other
                public page carries an accessibility link and a contact
                address, and the one page most visitors actually see carried
                neither. */}
            <Link href="/accessibility" className="transition-colors hover:text-foreground">
              {t("footerAccessibility")}
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-data transition-colors hover:text-foreground"
              dir="ltr"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
