"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CalendarContent } from "@/components/calendar/calendar-content";

export function CalendarTab({ isHe }: { isHe: boolean }) {
  const t = useTranslations("dashboardTabs");

  return (
    <div className="flex flex-col gap-3">
      {/* Full calendar link */}
      <div className="flex justify-end">
        <Link
          href="/calendar"
          className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-card/40 px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:border-foreground/20 hover:text-foreground/80"
        >
          {t("fullCalendarView")}
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* Embedded calendar content — reuses existing component */}
      <CalendarContent />
    </div>
  );
}
