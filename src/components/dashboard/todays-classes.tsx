"use client";

import { useMemo } from "react";
import { Clock, MapPin, User, BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/trpc/react";
import { getAcademicNow } from "@/lib/academic-calendar";
import { sessionTypeNameFor } from "@/lib/group-options";
import { hhmmToMinutesOr } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";

const JS_DAY_TO_SESSION: Record<number, string> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

const DAY_NAMES_HE: Record<string, string> = {
  SUNDAY: "ראשון",
  MONDAY: "שני",
  TUESDAY: "שלישי",
  WEDNESDAY: "רביעי",
  THURSDAY: "חמישי",
  FRIDAY: "שישי",
  SATURDAY: "שבת",
};

const DAY_NAMES_EN: Record<string, string> = {
  SUNDAY: "Sunday",
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
};

interface TodaysClassesProps {
  currentYear: number;
  currentSemester: "FALL" | "SPRING";
}

export function TodaysClasses({ currentYear, currentSemester }: TodaysClassesProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const t = useTranslations("dashboard");

  // Truth-gate (#39): outside the teaching phase there ARE no classes —
  // showing them would be a lie. A calm one-liner replaces the list.
  const acadNow = getAcademicNow();
  const teaching = acadNow.phase === "teaching";

  const { data, isLoading } = api.schedule.getScheduleForSemester.useQuery(
    { year: currentYear, semester: currentSemester },
    { retry: 1, staleTime: 5 * 60 * 1000, enabled: teaching }
  );

  const todayDayName = JS_DAY_TO_SESSION[new Date().getDay()] ?? "SUNDAY";

  const todaySessions = useMemo(() => {
    if (!data?.sessions) return [];
    return data.sessions
      .filter((s) => s.dayOfWeek === todayDayName)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  }, [data?.sessions, todayDayName]);

  // After ALL hooks (hooks order must not depend on the phase):
  if (!teaching) {
    // null = the next year's calendar isn't in TAU_CALENDARS yet. This used to
    // receive a fabricated mid-October date and print it as fact.
    const returnDate = acadNow.nextTeachingStart
      ? acadNow.nextTeachingStart.toLocaleDateString(isHe ? "he-IL" : "en-US", {
          day: "numeric",
          month: "long",
        })
      : null;
    return (
      <div className="data-card flex items-center gap-3 p-4 border-emerald-400/20 bg-emerald-400/5">
        <BookOpen className="h-5 w-5 text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-400">
          {acadNow.phase === "exams"
            ? isHe
              ? "תקופת בחינות — אין יותר שיעורים הסמסטר"
              : "Exam period — no more classes this semester"
            : returnDate
              ? isHe
                ? `חופשת סמסטר — הלימודים חוזרים ב־${returnDate}`
                : `Semester break — classes resume on ${returnDate}`
              : isHe
                ? "חופשת סמסטר — מועד חזרת הלימודים טרם פורסם"
                : "Semester break — the return date hasn't been published yet"}
        </p>
      </div>
    );
  }

  // Don't render anything while loading or on weekends with no classes
  if (isLoading) return null;
  if (!data?.sessions || data.sessions.length === 0) return null;

  const dayLabel = isHe
    ? DAY_NAMES_HE[todayDayName] ?? todayDayName
    : DAY_NAMES_EN[todayDayName] ?? todayDayName;

  // Session type labels — the ONE shared map (lib/group-options), which is
  // case-insensitive, so the hand-rolled upper+lower key pairs are gone.
  const typeLabel = (type: string | null) => (type ? sessionTypeNameFor(type, isHe) : "");

  if (todaySessions.length === 0) {
    return (
      <div className="data-card flex items-center gap-3 p-4 border-emerald-400/20 bg-emerald-400/5">
        <BookOpen className="h-5 w-5 text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-400">
          {isHe ? `יום ${dayLabel} — אין שיעורים היום` : `${dayLabel} — No classes today`}
        </p>
      </div>
    );
  }

  return (
    <div className="data-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-5 w-5 text-foreground/60" />
        <h3 className="font-display text-base font-bold text-foreground/90">
          {t("todaysClasses")}
        </h3>
        <span className="ms-auto text-xs text-foreground/40">
          {isHe ? `יום ${dayLabel}` : dayLabel}
        </span>
      </div>

      <div className="space-y-2">
        {todaySessions.map((session) => {
          const courseName = session.course?.nameHe ?? session.courseCode;
          const now = new Date();
          // One HH:MM parser (lib/time-of-day). The inline copy used Number(),
          // so an unreadable time became NaN and BOTH "now" and "past" silently
          // read false — the row just never lit up. The widest fallback (all
          // day) keeps it visible instead, which is what a student needs from a
          // "today's classes" list.
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const sessionStart = hhmmToMinutesOr(session.startTime, 0);
          const sessionEnd = hhmmToMinutesOr(session.endTime, 23 * 60 + 59);
          const isNow = currentMinutes >= sessionStart && currentMinutes <= sessionEnd;
          const isPast = currentMinutes > sessionEnd;

          return (
            <div
              key={session.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all",
                isNow
                  ? "border-emerald-400/30 bg-emerald-400/10"
                  : isPast
                    ? "border-foreground/5 bg-foreground/[0.02] opacity-50"
                    : "border-foreground/10 bg-foreground/[0.02]"
              )}
            >
              {/* Time */}
              <div className="shrink-0 text-center">
                <div dir="ltr" className={cn(
                  "font-mono text-sm font-semibold",
                  isNow ? "text-emerald-400" : "text-foreground/70"
                )}>
                  {session.startTime ?? "—"}
                </div>
                <div dir="ltr" className="font-mono text-[10px] text-foreground/30">
                  {session.endTime ?? ""}
                </div>
              </div>

              {/* Separator */}
              <div className={cn(
                "h-8 w-0.5 rounded-full shrink-0",
                isNow ? "bg-emerald-400/40" : "bg-foreground/10"
              )} />

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground/80">
                    {courseName}
                  </span>
                  {isNow && (
                    <span className="shrink-0 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      {isHe ? "עכשיו" : "Now"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-foreground/40">
                  {session.sessionType && (
                    <span>{typeLabel(session.sessionType)}</span>
                  )}
                  {session.room && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {session.room}
                    </span>
                  )}
                  {session.lecturerName && (
                    <span className="flex items-center gap-0.5">
                      <User className="h-3 w-3" />
                      {session.lecturerName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
