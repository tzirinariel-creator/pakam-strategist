"use client";

import {
  GraduationCap,
  CalendarDays,
  ShieldCheck,
  Check,
  BookOpen,
  Scale,
  Lock,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { listPrograms } from "@/lib/programs/registry";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";

interface StepWelcomeProps {
  onNext: () => void;
  selectedProgram?: string | null;
  onProgramSelect?: (programCode: string) => void;
}

const PROGRAM_ICONS: Record<string, typeof GraduationCap> = {
  PPE: GraduationCap,
  LAW: Scale,
};

// Programs that are fully ready (have courses in DB, onboarding flow, etc.).
// LAW is defined but not yet serviceable, so it stays locked ("coming soon").
const ACTIVE_PROGRAMS = new Set(["PPE"]);

export function StepWelcome({ onNext, selectedProgram, onProgramSelect }: StepWelcomeProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";
  const programs = listPrograms();

  const features = [
    {
      icon: CalendarDays,
      title: t("featurePlan"),
      description: t("featurePlanDesc"),
      delay: "animate-stagger-2",
    },
    {
      icon: ShieldCheck,
      title: t("featureRegulations"),
      description: t("featureRegulationsDesc"),
      delay: "animate-stagger-2",
    },
    {
      // The King himself, named — this is the "meet the King" card, not a generic
      // locked AI feature (#5/#8/#13). The note stays but its badge is a positive
      // check (free-first), not a Lock that reads as premium/locked.
      icon: PhilosopherKingIcon,
      title: t("featureMentor"),
      description: t("featureMentorDesc"),
      note: t("featureMentorByok"),
      delay: "animate-stagger-3",
    },
    {
      icon: BookOpen,
      title: t("featureCommunity"),
      description: t("featureCommunityDesc"),
      delay: "animate-stagger-3",
    },
  ] as const;

  const steps = [
    t("howItWorksStep1"),
    t("howItWorksStep2"),
    t("howItWorksStep3"),
  ];

  // Translation key map for program descriptions
  const PROGRAM_DESC_KEYS: Record<string, string> = {
    PPE: "ppeDesc",
    LAW: "lawDesc",
  };

  const PROGRAM_NAME_KEYS: Record<string, string> = {
    PPE: "ppe",
    LAW: "law",
  };

  return (
    <div className="flex flex-col items-center text-center">
      {/* Hero icon */}
      <div className="animate-stagger-1 mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-foreground/10 shadow-sm">
        <GraduationCap className="h-10 w-10 text-foreground/80" />
      </div>

      {/* Title */}
      <h2 className="animate-stagger-1 font-display text-foreground font-bold text-3xl md:text-4xl">
        {t("welcomeTitle")}
      </h2>

      {/* Subtitle */}
      <p className="animate-stagger-2 mt-3 max-w-md text-lg text-foreground/60">
        {t("welcomeSubtitle")}
      </p>

      {/* Feature highlights — 2x2 grid */}
      <div className="mt-10 grid w-full max-w-lg gap-3 grid-cols-1 sm:grid-cols-2">
        {features.map((feature) => (
          <div
            key={feature.title}
            className={cn(
              "data-card flex items-start gap-3 p-4 text-start",
              feature.delay
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/8">
              <feature.icon className="h-[18px] w-[18px] text-foreground/60" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold text-foreground/90">
                {feature.title}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/50">
                {feature.description}
              </p>
              {"note" in feature && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-2.5 w-2.5" />
                  {feature.note}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Program selection */}
      {programs.length > 1 && (
        <div className="animate-stagger-4 mt-10 w-full max-w-lg">
          <h3 className="font-display mb-1 text-sm font-semibold text-foreground/70">
            {t("chooseProgram")}
          </h3>
          <p className="mb-4 text-xs text-foreground/40">
            {t("chooseProgramDesc")}
          </p>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {programs.map((program) => {
              const Icon = PROGRAM_ICONS[program.programCode] ?? GraduationCap;
              const isActive = ACTIVE_PROGRAMS.has(program.programCode);
              const isSelected = selectedProgram === program.programCode;
              const nameKey = PROGRAM_NAME_KEYS[program.programCode];
              const descKey = PROGRAM_DESC_KEYS[program.programCode];

              return (
                <button
                  key={program.id}
                  onClick={() => {
                    if (isActive && onProgramSelect) {
                      onProgramSelect(program.programCode);
                    }
                  }}
                  disabled={!isActive}
                  className={cn(
                    "relative flex items-start gap-3 rounded-xl border p-4 text-start transition-all",
                    isActive && "hover-lift",
                    isActive && !isSelected &&
                      "border-foreground/10 bg-foreground/[0.02] hover:border-foreground/25 hover:bg-foreground/5 cursor-pointer",
                    isActive && isSelected &&
                      "border-foreground/40 bg-foreground/8 ring-1 ring-foreground/20 shadow-card cursor-pointer",
                    !isActive &&
                      "border-foreground/5 bg-foreground/[0.01] opacity-50 cursor-not-allowed"
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      isActive ? "bg-foreground/8" : "bg-foreground/5"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isActive
                          ? "text-foreground/70"
                          : "text-foreground/30"
                      )}
                    />
                  </div>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isActive
                            ? "text-foreground/90"
                            : "text-foreground/40"
                        )}
                      >
                        {nameKey ? t(nameKey) : (isHe ? program.nameHe : program.nameEn)}
                      </span>

                      {!isActive && (
                        <span className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/30">
                          <Lock className="h-2.5 w-2.5" />
                          {t("comingSoon")}
                        </span>
                      )}
                    </div>

                    <p
                      className={cn(
                        "mt-0.5 text-xs leading-relaxed",
                        isActive
                          ? "text-foreground/50"
                          : "text-foreground/25"
                      )}
                    >
                      {descKey ? t(descKey) : (isHe ? program.fullNameHe : program.fullNameEn)}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  {isActive && isSelected && (
                    <div className="absolute top-2 end-2 h-2 w-2 rounded-full bg-foreground/60" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* How it works — compact flow */}
      <div className="animate-stagger-4 mt-8 flex flex-wrap items-center justify-center gap-2">
        {steps.map((step, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-foreground/15 text-xs">·</span>
            )}
            <span className="rounded-full bg-foreground/5 px-3 py-1 text-xs text-foreground/40">
              {i + 1}. {step}
            </span>
          </span>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onNext}
        className="animate-stagger-5 bg-foreground mt-8 rounded-xl px-10 py-4 text-lg font-bold text-background shadow-sm transition-all hover:scale-105 hover:shadow-lg press-scale"
      >
        {t("letsStart")}
      </button>

      {/* Time note */}
      <p className="animate-stagger-5 mt-3 text-xs text-foreground/30">
        {t("welcomeNote")}
      </p>
    </div>
  );
}
