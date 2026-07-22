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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { cn } from "@/lib/utils";

// ─── Feature Card Data ──────────────────────────────────────────────
// The King has his own dedicated dark band above the grid; the grid holds the
// six concrete tools. Colors are the harmonized discipline hues — never a lone
// acid accent.

const FEATURES = [
  { key: "planner", icon: GraduationCap, color: "#4A90D9" },
  { key: "catalog", icon: BookOpen, color: "#8B5CF6" },
  { key: "calendar", icon: Calendar, color: "#4A90D9" },
  { key: "grades", icon: BarChart3, color: "#2ECC71" },
  { key: "regulations", icon: Scale, color: "#E74C3C" },
  { key: "syllabus", icon: FileText, color: "#0D9488" },
] as const;

// ─── Product Preview (a styled mini-planner — "show, don't tell") ────

const PREVIEW_SEMESTERS = [
  {
    he: "שנה א׳",
    en: "Year 1",
    courses: [
      { he: "מבוא ללוגיקה", en: "Intro to Logic", color: "#4A90D9", credits: 4 },
      { he: "מיקרו כלכלה א׳", en: "Microecon I", color: "#2ECC71", credits: 5 },
    ],
  },
  {
    he: "שנה ב׳",
    en: "Year 2",
    courses: [
      { he: "פילוסופיה פוליטית", en: "Political Phil.", color: "#4A90D9", credits: 4 },
      { he: "פוליטיקה השוואתית", en: "Comparative Pol.", color: "#E74C3C", credits: 4 },
    ],
  },
  {
    he: "שנה ג׳",
    en: "Year 3",
    courses: [
      { he: "חקיקה ורגולציה", en: "Legislation", color: "#F39C12", credits: 4 },
      { he: "סמינר פכ״מ", en: "PPE Seminar", color: "#6B7280", credits: 4 },
    ],
  },
] as const;

// Window chrome traffic-lights — the mac-window motif reused across the page.
function WindowDots() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
      <span className="size-2.5 rounded-full bg-[#febc2e]" />
      <span className="size-2.5 rounded-full bg-[#28c840]" />
    </div>
  );
}

function PlannerPreview({ isRTL }: { isRTL: boolean }) {
  return (
    <div
      aria-hidden
      className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-float"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-3">
        <WindowDots />
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
                  <div className="truncate text-[11px] font-medium text-foreground/90">
                    {isRTL ? c.he : c.en}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
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
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
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

  const stats = [
    { value: "110+", label: t("stats.courses") },
    { value: "3", label: t("stats.disciplines") },
    { value: "150", label: t("stats.credits") },
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
              className="bg-foreground text-background hover:bg-foreground/90"
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
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-crown-gold/30 bg-card px-4 py-1.5 text-sm font-medium text-foreground/75 shadow-sm">
              <PhilosopherKingIcon className="size-4 text-crown-gold" />
              {t("badge")}
            </div>

            <h1 className="mb-6 text-display-l text-balance text-foreground">
              {t("heroTitle")}
            </h1>

            <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              {t("heroSubtitle")}
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                size="lg"
                className="w-full bg-foreground px-8 text-background shadow-lg shadow-foreground/20 hover:bg-foreground/90 sm:w-auto"
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
                { title: t("proof.chip1Title"), body: t("proof.chip1Body"), rotate: "-rotate-2", mono: false },
                { title: t("proof.chip2Title"), body: t("proof.chip2Body"), rotate: "rotate-1", mono: false },
                { title: t("proof.chip3Title"), body: t("proof.chip3Body"), rotate: "rotate-2", mono: true },
                { title: t("proof.chip4Title"), body: t("proof.chip4Body"), rotate: "-rotate-1", mono: false },
              ] as const).map((chip) => (
                <div
                  key={chip.title}
                  className={cn(
                    "w-[calc(50%-0.375rem)] max-w-[220px] rounded-lg border border-dashed border-foreground/25 bg-muted/40 px-3.5 py-3 transition-transform duration-300 hover:rotate-0 sm:w-auto",
                    chip.rotate,
                  )}
                >
                  <p className="text-sm font-bold text-foreground/75">{chip.title}</p>
                  {/* No dir="ltr" here: bodies mix Hebrew words with latin/numbers,
                      and the browser's bidi already lays latin runs LTR. Forcing
                      dir="ltr" on Hebrew is wrong (and was a bug). font-mono keeps
                      the "spreadsheet filename" texture on the mono chip. */}
                  <p
                    className={cn(
                      "mt-1 text-xs leading-relaxed text-foreground/55",
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
                <WindowDots />
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
            <h2 className="font-display text-2xl font-bold tracking-tight text-white text-balance md:text-4xl">
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
              <WindowDots />
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
                  <div
                    className="mb-4 flex size-11 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${feature.color} 14%, transparent)`,
                    }}
                  >
                    <Icon
                      className="size-5 transition-transform group-hover:scale-110"
                      style={{ color: feature.color }}
                    />
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
          <p className="mt-5 text-xs text-muted-foreground/80">{t("founder.meta")}</p>
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
              className="w-full bg-foreground px-8 text-background shadow-lg shadow-foreground/20 hover:bg-foreground/90 sm:w-auto"
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
          </div>
        </div>
      </footer>
    </div>
  );
}
