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
  {
    key: "planner",
    icon: GraduationCap,
    color: "#1a1a1a",
  },
  {
    key: "catalog",
    icon: BookOpen,
    color: "#8B5CF6",
  },
  {
    key: "calendar",
    icon: Calendar,
    color: "#4A90D9",
  },
  {
    key: "grades",
    icon: BarChart3,
    color: "#2ECC71",
  },
  {
    key: "regulations",
    icon: Scale,
    color: "#E74C3C",
  },
  {
    key: "syllabus",
    icon: FileText,
    color: "#F39C12",
  },
] as const;

// ─── Component ──────────────────────────────────────────────────────

export function LandingPage() {
  const t = useTranslations("landing");
  const locale = useLocale();
  const isRTL = locale === "he";
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

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
      <section className="relative overflow-hidden px-4 py-16 sm:px-6 md:py-32">
        {/* Subtle background accents */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute start-1/4 top-20 size-96 rounded-full bg-foreground/5 blur-3xl" />
          <div className="absolute end-1/4 bottom-20 size-80 rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-foreground/10 px-4 py-1.5 text-sm font-medium text-foreground/80">
            <Sparkles className="size-4" />
            {t("badge")}
          </div>

          <h1 className="mb-6 font-bold text-3xl leading-tight text-foreground sm:text-4xl md:text-6xl md:leading-tight">
            {t("heroTitle")}
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
            {t("heroSubtitle")}
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="bg-foreground px-8 text-background hover:bg-foreground/90"
              asChild
            >
              <Link href="/signup">
                {t("ctaStart")}
                <Arrow className="ms-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="px-8" asChild>
              <Link href="/login">{t("ctaLogin")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────── */}
      <section className="border-t border-border/50 bg-card/30 px-4 py-12 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 font-bold text-3xl text-foreground md:text-4xl">
              {t("featuresTitle")}
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              {t("featuresSubtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.key}
                  className={cn(
                    "group rounded-xl border border-border/60 bg-card p-6 transition-all",
                    "hover:border-border hover:shadow-lg hover:shadow-black/5"
                  )}
                >
                  <div
                    className="mb-4 flex size-12 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${feature.color} 15%, transparent)`,
                    }}
                  >
                    <Icon
                      className="size-6 transition-transform group-hover:scale-110"
                      style={{ color: feature.color }}
                    />
                  </div>
                  <h3 className="mb-2 font-bold text-lg text-foreground">
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
      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-4">
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
            <Link
              href="/about"
              className="transition-colors hover:text-foreground"
            >
              {t("footerAbout")}
            </Link>
            <Link
              href="/faq"
              className="transition-colors hover:text-foreground"
            >
              {t("footerFaq")}
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              {t("footerPrivacy")}
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              {t("footerTerms")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
