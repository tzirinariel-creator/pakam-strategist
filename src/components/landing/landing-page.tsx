"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  GraduationCap,
  Calendar,
  BarChart3,
  BookOpen,
  Scale,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Feature Card Data ──────────────────────────────────────────────

const FEATURES = [
  { key: "planner", icon: GraduationCap, color: "#4A90D9" },
  { key: "catalog", icon: BookOpen, color: "#8B5CF6" },
  { key: "calendar", icon: Calendar, color: "#4A90D9" },
  { key: "grades", icon: BarChart3, color: "#2ECC71" },
  { key: "regulations", icon: Scale, color: "#E74C3C" },
  { key: "syllabus", icon: FileText, color: "#F39C12" },
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

function PlannerPreview({ isRTL }: { isRTL: boolean }) {
  return (
    <div
      aria-hidden
      className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/10"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <div className="mx-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <GraduationCap className="size-3" />
          <span>{isRTL ? "תכנון התואר" : "Degree planner"}</span>
        </div>
      </div>

      {/* Credit progress */}
      <div className="px-4 pt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
          <span className="font-semibold text-foreground">
            33 <span className="text-muted-foreground">/ 150 {isRTL ? "ש״ס" : "credits"}</span>
          </span>
          <span className="text-muted-foreground">{isRTL ? "22%" : "22%"}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[22%] rounded-full bg-foreground" />
        </div>
      </div>

      {/* Mini planner grid */}
      <div className="grid grid-cols-3 gap-2 p-4">
        {PREVIEW_SEMESTERS.map((sem) => (
          <div key={sem.en}>
            <div className="mb-2 text-[10px] font-medium text-muted-foreground">
              {isRTL ? sem.he : sem.en}
            </div>
            <div className="space-y-1.5">
              {sem.courses.map((c) => (
                <div
                  key={c.en}
                  className="rounded-md border border-border/50 border-s-2 bg-background px-2 py-1.5"
                  style={{ borderInlineStartColor: c.color }}
                >
                  <div className="truncate text-[9px] font-medium text-foreground/90">
                    {isRTL ? c.he : c.en}
                  </div>
                  <div className="text-[8px] text-muted-foreground">
                    {c.credits} {isRTL ? "ש״ס" : "cr"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer chip — compliance */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-2.5 text-[10px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Scale className="size-3" />
          {isRTL ? "תקנון" : "Regulations"}
        </span>
        <span className="rounded-full bg-[#2ECC71]/15 px-2 py-0.5 font-medium text-[#1f9d55]">
          {isRTL ? "4 / 17 כללים" : "4 / 17 rules"}
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
    { value: "117", label: t("stats.courses") },
    { value: "17", label: t("stats.rules") },
    { value: "150", label: t("stats.credits") },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navigation Bar ───────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-6 text-foreground/80 sm:size-7" />
            <span className="font-bold text-lg text-foreground/80 sm:text-xl">
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
        {/* Background depth: soft glows + faint grid */}
        <div className="bg-mesh pointer-events-none absolute inset-0">
          <div className="absolute start-1/4 top-0 size-[28rem] rounded-full bg-foreground/[0.04] blur-3xl" />
          <div className="absolute end-1/4 bottom-0 size-80 rounded-full bg-blue-500/[0.06] blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)",
            }}
          />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-8">
          {/* Text column */}
          <div className="text-center lg:text-start">
            <div className="eyebrow mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-foreground/70 shadow-sm">
              <Sparkles className="size-4" />
              {t("badge")}
            </div>

            <h1 className="mb-6 text-display-l text-foreground">
              {t("heroTitle")}
            </h1>

            <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              {t("heroSubtitle")}
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
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

            {/* Stat strip — grounding / social proof */}
            <div className="mt-10 flex items-center justify-center gap-6 sm:gap-8 lg:justify-start">
              {stats.map((s, i) => (
                <div key={s.label} className="flex items-center gap-6 sm:gap-8">
                  {i > 0 && <div className="h-8 w-px bg-border" />}
                  <div className="text-center lg:text-start">
                    <div className="tabular font-bold text-2xl text-foreground">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product preview column */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <PlannerPreview isRTL={isRTL} />
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
            <p className="mx-auto max-w-xl text-muted-foreground">
              {t("featuresSubtitle")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.key}
                  className={cn(
                    "group rounded-2xl border border-border/60 bg-card p-6 transition-all duration-200",
                    "hover:-translate-y-0.5 hover:border-border hover:shadow-xl hover:shadow-black/5"
                  )}
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

      {/* ── University Badge ─────────────────────────────── */}
      <section className="px-4 py-14 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
            <GraduationCap className="size-8 text-foreground/80" />
            <div className="text-start">
              <p className="font-bold text-lg text-foreground">
                {t("universityTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("universitySubtitle")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-card/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="size-4 text-foreground/60" />
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
