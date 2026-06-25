"use client";

import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { DISCIPLINE_CONFIG, FOCUS_DISCIPLINE_IDS } from "@/lib/constants";
import type { OnboardingData } from "./onboarding-wizard";

interface StepAboutProps {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
}

export function StepAbout({ data, onUpdate }: StepAboutProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const isHe = locale === "he";

  const yearOptions = [
    { value: 1, label: t("yearA") },
    { value: 2, label: t("yearB") },
    { value: 3, label: t("yearC") },
  ] as const;

  const semesterOptions = [
    { value: "FALL" as const, label: t("semesterA") },
    { value: "SPRING" as const, label: t("semesterB") },
  ] as const;

  const focusOptions = [
    ...FOCUS_DISCIPLINE_IDS.map((id) => {
      const cfg = DISCIPLINE_CONFIG[id]!;
      return {
        value: id as string | null,
        label: isHe ? cfg.nameHe : cfg.nameEn,
        glowClass: cfg.glowClass,
        borderClass: cfg.borderClass,
        bgClass: `${cfg.bgClass}/10`,
        textClass: cfg.textClass,
      };
    }),
    {
      value: null as string | null,
      label: t("undecided"),
      glowClass: "",
      borderClass: "border-foreground/20",
      bgClass: "bg-foreground/5",
      textClass: "text-foreground/60",
    },
  ];

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="animate-stagger-1 text-center">
        <h2 className="font-bold text-2xl text-foreground/90">
          {t("aboutYou")}
        </h2>
        <p className="mt-2 text-foreground/50">{t("aboutYouDesc")}</p>
      </div>

      <div className="mt-8 w-full max-w-xl space-y-8">
        {/* Year selection */}
        <div className="animate-stagger-2">
          <h3 className="mb-3 text-sm font-medium text-foreground/70">
            {t("yourYear")}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {yearOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onUpdate({ year: option.value })}
                className={cn(
                  "rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                  data.year === option.value
                    ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                    : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Semester selection */}
        <div className="animate-stagger-3">
          <h3 className="mb-3 text-sm font-medium text-foreground/70">
            {t("yourSemester")}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {semesterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onUpdate({ semester: option.value })}
                className={cn(
                  "rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                  data.semester === option.value
                    ? "border-foreground bg-foreground/10 text-foreground/80 shadow-sm"
                    : "border-border bg-card text-foreground/60 hover:border-foreground/30"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus area selection */}
        <div className="animate-stagger-4">
          <h3 className="mb-1 text-sm font-medium text-foreground/70">
            {t("yourFocus")}
          </h3>
          <p className="mb-3 text-xs text-foreground/40">
            {t("focusHint")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {focusOptions.map((option) => {
              const isSelected = data.focusArea === option.value;
              return (
                <button
                  key={option.value ?? "undecided"}
                  onClick={() => onUpdate({ focusArea: option.value })}
                  className={cn(
                    "rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all",
                    isSelected
                      ? cn(option.borderClass, option.bgClass, option.textClass, option.glowClass)
                      : "border-border bg-card text-foreground/60 hover:border-foreground/20"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
