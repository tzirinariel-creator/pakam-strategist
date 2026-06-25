"use client";

import { GraduationCap, Scale, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface StepProgramProps {
  selected: "PPE" | null;
  onSelect: (program: "PPE") => void;
}

interface ProgramOption {
  id: "PPE" | "LAW" | "EE";
  nameKey: "ppe" | "law" | "electricalEng";
  descKey: "ppeDesc";
  icon: typeof GraduationCap;
  enabled: boolean;
}

const PROGRAMS: ProgramOption[] = [
  {
    id: "PPE",
    nameKey: "ppe",
    descKey: "ppeDesc",
    icon: GraduationCap,
    enabled: true,
  },
  {
    id: "LAW",
    nameKey: "law",
    descKey: "ppeDesc", // unused for disabled
    icon: Scale,
    enabled: false,
  },
  {
    id: "EE",
    nameKey: "electricalEng",
    descKey: "ppeDesc", // unused for disabled
    icon: Zap,
    enabled: false,
  },
];

export function StepProgram({ selected, onSelect }: StepProgramProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="animate-stagger-1 text-center">
        <h2 className="font-bold text-2xl text-foreground/90">
          {t("chooseProgram")}
        </h2>
        <p className="mt-2 text-foreground/50">{t("chooseProgramDesc")}</p>
      </div>

      {/* Program cards */}
      <div className="mt-8 grid w-full max-w-xl gap-4">
        {PROGRAMS.map((program, idx) => {
          const isSelected = program.id === "PPE" && selected === "PPE";
          const Icon = program.icon;

          return (
            <button
              key={program.id}
              disabled={!program.enabled}
              onClick={() => {
                if (program.enabled && program.id === "PPE") {
                  onSelect("PPE");
                }
              }}
              className={cn(
                "relative flex items-center gap-4 rounded-xl border-2 p-6 text-start transition-all",
                `animate-stagger-${idx + 2}`,
                program.enabled
                  ? "cursor-pointer hover:border-foreground/40"
                  : "cursor-not-allowed opacity-50",
                isSelected
                  ? "border-foreground bg-foreground/10 shadow-sm"
                  : "border-border bg-card"
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                  isSelected
                    ? "bg-foreground/20"
                    : "bg-foreground/5"
                )}
              >
                <Icon
                  className={cn(
                    "h-7 w-7",
                    isSelected ? "text-foreground/80" : "text-foreground/40"
                  )}
                />
              </div>

              {/* Text */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3
                    className={cn(
                      "text-lg font-semibold",
                      isSelected
                        ? "text-foreground/80"
                        : "text-foreground/80"
                    )}
                  >
                    {t(program.nameKey)}
                  </h3>
                  {!program.enabled && (
                    <span className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs text-foreground/40">
                      {t("comingSoon")}
                    </span>
                  )}
                </div>
                {program.enabled ? (
                  <p className="mt-1 text-sm text-foreground/50">
                    {t("ppeDesc")}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-foreground/30">
                    {t("comingSoon")}...
                  </p>
                )}
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground">
                  <svg
                    className="h-4 w-4 text-background"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
