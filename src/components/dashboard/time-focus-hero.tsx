"use client";

// #10 (18:19) — the season-aware hero. Whatever the calendar phase, this points
// the student at THE one action that matters now. Pure-data driven (the parent
// computes the focus from state it already holds); renders null off-calendar.

import { useLocale } from "next-intl";
import { CalendarClock, ClipboardCheck, Gavel, CalendarDays, GraduationCap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { TimeFocus } from "@/lib/time-focus";
import { cn } from "@/lib/utils";
import { daysUntilLabel } from "@/lib/days-until";

const META: Record<
  TimeFocus["kind"],
  { icon: typeof CalendarClock; tone: string }
> = {
  exams: { icon: CalendarClock, tone: "border-red-500/30 bg-red-500/[0.05]" },
  grades: { icon: ClipboardCheck, tone: "border-emerald-500/30 bg-emerald-500/[0.05]" },
  bidding: { icon: Gavel, tone: "border-accent-brand/30 bg-accent-brand/[0.05]" },
  teaching: { icon: CalendarDays, tone: "border-sky-500/25 bg-sky-500/[0.04]" },
  plan: { icon: GraduationCap, tone: "border-border/60 bg-foreground/[0.02]" },
};

export function TimeFocusHero({ focus }: { focus: TimeFocus | null }) {
  const isHe = useLocale() === "he";
  if (!focus) return null;
  const meta = META[focus.kind];
  const Icon = meta.icon;

  const copy = (() => {
    const d = focus.days ?? 0;
    switch (focus.kind) {
      case "exams":
        return {
          title: isHe
            ? d <= 0 ? "יום המבחן הגיע" : d === 1 ? "מבחן מחר" : `המבחן הקרוב בעוד ${d} ימים`
            : d <= 0 ? "Exam day" : d === 1 ? "Exam tomorrow" : `Nearest exam in ${d} days`,
          body: isHe
            ? "עכשיו הזמן לתכנן את הלמידה — נפרוס לך את הימים עד כל מבחן."
            : "Now's the time to plan your studying — we'll lay out the days to each exam.",
          cta: isHe ? "לתכנון המבחנים" : "Plan my exams",
        };
      case "grades":
        return {
          title: isHe ? "הציונים מתחילים להתפרסם" : "Grades are coming in",
          body: isHe
            ? "סרקו את הגיליון או הזינו ציונים — הממוצע ובדיקת-המסלול יתעדכנו מיד."
            : "Scan your sheet or enter grades — your average and track check update instantly.",
          cta: isHe ? "לעדכון ציונים" : "Update grades",
        };
      case "bidding":
        return {
          title: isHe ? `לקראת המכרז — ${daysUntilLabel(d, true)}` : `Toward bidding — ${daysUntilLabel(d, false)}`,
          body: isHe
            ? "סגרו את התוכנית לסמסטר הבא ובדקו חפיפות לפני שההרשמה נפתחת."
            : "Finalize next semester's plan and check clashes before registration opens.",
          cta: isHe ? "לבדיקת חפיפות" : "Check clashes",
        };
      case "teaching":
        return {
          title: isHe ? "אנחנו באמצע הסמסטר" : "Mid-semester",
          body: isHe
            ? "זה השבוע שלכם — המערכת, החדרים והשעות, במקום אחד."
            : "Here's your week — timetable, rooms and times in one place.",
          cta: isHe ? "למערכת השעות" : "My week",
        };
      case "plan":
        return {
          title: isHe ? "זמן טוב לתכנן קדימה" : "A good time to plan ahead",
          body: isHe
            ? "פרסו את הסמסטרים הבאים, בדקו מה נשאר לתואר וסגרו פערים."
            : "Lay out the coming semesters, see what's left, and close gaps.",
          cta: isHe ? "לתכנון התואר" : "Plan my degree",
        };
    }
  })();

  return (
    <div className={cn("data-card flex flex-wrap items-center gap-3 p-4", meta.tone)}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/8 text-foreground/70">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground/85">{copy.title}</p>
        <p className="mt-0.5 text-xs text-foreground/60">{copy.body}</p>
      </div>
      <Link
        href={focus.href}
        className="shrink-0 rounded-lg bg-foreground px-3.5 py-2 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
      >
        {copy.cta}
      </Link>
    </div>
  );
}
