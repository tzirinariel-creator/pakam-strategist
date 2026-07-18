"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FolderOpen, Plus, GraduationCap } from "lucide-react";
import { usePersonalAddress } from "@/components/personal/use-personal-address";

// -----------------------------------------------------------------------
// Empty state — honest CTA. The primary action points at THIS screen's
// add-course form (an empty record with planned courses still lives on /record,
// so promising "onboarding" would be a dead end). The dashboard/onboarding link
// only appears when the student has zero courses ANYWHERE — the one case where
// building a fresh plan there is genuinely the right next step.
// -----------------------------------------------------------------------

export function EmptyState({
  hasAnyCourses,
  onAddFirstCourse,
  t,
}: {
  hasAnyCourses: boolean;
  onAddFirstCourse: () => void;
  t: ReturnType<typeof useTranslations<"record">>;
}) {
  const { greetName } = usePersonalAddress();
  return (
    <div className="data-card mx-auto w-full max-w-lg p-8 text-center">
      <div className="mb-5 flex justify-center">
        <FolderOpen className="h-14 w-14 text-foreground/70" />
      </div>
      <h2 className="mb-2 font-display text-2xl font-bold text-foreground/85">
        {greetName ? `${greetName}, ` : ""}{t("emptyTitle")}
      </h2>
      <p className="mb-6 text-foreground/60">
        {hasAnyCourses ? t("emptyDesc") : t("emptyDescNoCourses")}
      </p>
      <div className="flex flex-col items-center gap-3">
        {/* Primary, honest CTA — jumps to the add-course form on this screen. */}
        <button
          type="button"
          onClick={onAddFirstCourse}
          className="inline-flex items-center gap-2 rounded-full border border-accent-brand/30 bg-accent-brand/15 px-6 py-2.5 text-sm font-bold text-foreground/90 transition-colors hover:bg-accent-brand/25"
        >
          <Plus className="h-4 w-4" />
          {t("emptyAddFirstCourse")}
        </button>
        {/* Onboarding link only when the student has no courses at all. */}
        {!hasAnyCourses && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground/55 underline-offset-4 transition-colors hover:text-foreground/80 hover:underline"
          >
            <GraduationCap className="h-4 w-4" />
            {t("backToOnboarding")}
          </Link>
        )}
      </div>
    </div>
  );
}
