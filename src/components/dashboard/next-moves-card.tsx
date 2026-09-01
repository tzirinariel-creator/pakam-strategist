"use client";

// -----------------------------------------------------------------------
// "מה עוד יש כאן" — one list, and the only one on this screen
// -----------------------------------------------------------------------
// Replaces the welcome checklist, the feature-discovery card and the
// "הצעד הבא שלכם" quick-action row. See src/lib/next-moves.ts for the four
// rules it enforces; the two that show up here are:
//
//   • it renders EVERY move it counts, so "3/7" can never describe rows the
//     student cannot see (the old card counted 3 and rendered 5 of 8);
//   • it returns null once the last move ticks, and once it is dismissed.
//
// Two traces are not on the dashboard already, so they are fetched here:
// ai.getChatSessions (did they ever actually talk to the advisor) and
// cohort.myContributionStats (did they ever actually write anything). Both are
// requested on the same render pass as the dashboard's own queries, so they
// join the same tRPC batch. Until BOTH have resolved the card renders nothing:
// a row that says "you have not done this" because a request was in flight is
// the exact untrustworthiness this replacement exists to fix.

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  BookOpen,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronLeft,
  ListChecks,
  Pencil,
  PenLine,
  Target,
  X,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { nextMoves, type MoveId } from "@/lib/next-moves";
import { usePersona, PersonaCharacter } from "@/components/persona/use-persona";
import { personaLabels, withAdvisorName } from "@/lib/persona";
import { heNoun } from "@/lib/he-count";
import { Bidi } from "@/lib/bidi";

const DISMISS_KEY = "pakamon-next-moves-dismissed";

/**
 * Copy rule: say what the screen DOES, in the words a student would use.
 * "תכנון מבחנים" means nothing to someone who has never opened it. Every claim
 * here is checked against the screen it describes — the .xlsx and .ics come
 * from src/lib/xlsx-export.ts, the confirm-before-writing from the advisor's
 * action router, the Google sync from settings/google-calendar-section.tsx.
 */
const COPY: Record<
  MoveId,
  { icon: React.ComponentType<{ className?: string }>; he: [string, string, string]; en: [string, string, string] }
> = {
  // [todo title, done title, one line of what it does]
  plan: {
    icon: BookOpen,
    he: ["בנו את התוכנית", "התוכנית בנויה", "כל הקורסים של הסמסטר על לוח אחד, עם החפיפות מסומנות."],
    en: ["Build your plan", "Your plan is built", "Every course of the semester on one grid, with clashes flagged."],
  },
  grades: {
    icon: Pencil,
    he: ["הזינו את הציונים שכבר יש לכם", "הציונים בפנים", "בלי הציונים מהעבר הממוצע וציון הגמר לא יכולים להראות כלום."],
    en: ["Enter the grades you already have", "Your grades are in", "Without past grades the average and final score have nothing to show."],
  },
  focus: {
    icon: Target,
    he: ["בחרו תחום מיקוד", "תחום המיקוד נבחר", "בלי תחום מיקוד בדיקת התקנון לא יודעת מול איזו דרישה לבדוק אתכם."],
    en: ["Choose a focus area", "Focus area chosen", "Without one, the regulation check has no requirement to check you against."],
  },
  examPlanner: {
    icon: CalendarClock,
    he: [
      "פרסו את החזרה לקראת המבחנים",
      "יש לכם תוכנית למידה",
      "בוחרים בחינות, והמסך מחלק ביניהן את הימים שנשארו ומוציא את זה לאקסל וליומן.",
    ],
    en: [
      "Spread your revision across the days left",
      "You have a study plan",
      "Pick your sittings and the screen splits the remaining days between them, then exports to Excel and your calendar.",
    ],
  },
  advisor: {
    icon: BookOpen, // replaced by the persona portrait at render time
    he: [
      "דברו עם {advisor}",
      "כבר דיברתם עם {advisor}",
      'אפשר לשאול אותו כל שאלה על התואר, ואפשר גם להגיד לו "סיימתי מיקרו עם 88" והוא יעדכן אחרי אישור שלכם.',
    ],
    en: [
      "Talk to {advisor}",
      "You have talked to {advisor}",
      'Ask anything about the degree, or just say "I finished Micro with 88" and he updates it once you confirm.',
    ],
  },
  calendarSync: {
    icon: CalendarPlus,
    he: ["סנכרנו את המערכת ליומן", "היומן מסונכרן", "השיעורים והבחינות נכנסים ליומן Google שלכם מתוך ההגדרות, בלי להקליד אותם."],
    en: ["Sync your timetable to your calendar", "Your calendar is synced", "Classes and exams go into your Google Calendar from Settings, with no typing."],
  },
  cohort: {
    icon: PenLine,
    he: ["כתבו על קורס אחד שסיימתם", "כבר תרמתם למחזור", "מי שיגיע אחריכם יקרא את זה בקטלוג, בלי השם שלכם."],
    en: ["Write about one course you finished", "You have contributed", "Whoever comes after you reads it in the catalog, without your name."],
  },
};

export interface NextMovesCardProps {
  /** Traces the dashboard already holds. */
  courseCount: number;
  gradedCount: number;
  hasFocusArea: boolean;
  studyTaskCount: number;
  calendarConnected: boolean;
  /** Real published dates, or null. Nothing else may create urgency. */
  daysToBidding: number | null;
  daysToNearestExam: number | null;
}

export function NextMovesCard(props: NextMovesCardProps) {
  const isHe = useLocale() === "he";
  const { persona } = usePersona();
  const advisorName = personaLabels(persona, isHe).name;

  const chats = api.ai.getChatSessions.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: 1 });
  const contributions = api.cohort.myContributionStats.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Both `dueInDays` values are a function of "now", so the server and the
  // client compute them at two different instants. This dashboard sits inside a
  // Suspense boundary where a hydration mismatch does not merely warn: the
  // boundary stops resolving and the student is left on the loader forever.
  // That shipped once already. A time-dependent card renders after mount only.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      /* storage blocked — hidden for this view, which is what was asked */
    }
  };

  if (!mounted || dismissed) return null;
  // A tick has to mean something, so nothing is claimed until every trace is in.
  if (!chats.isSuccess || !contributions.isSuccess) return null;

  const { moves, done, total, complete } = nextMoves({
    courseCount: props.courseCount,
    gradedCount: props.gradedCount,
    hasFocusArea: props.hasFocusArea,
    studyTaskCount: props.studyTaskCount,
    calendarConnected: props.calendarConnected,
    advisorMessageCount: chats.data.reduce((n, s) => n + s.messageCount, 0),
    cohortContributions: contributions.data.total,
    daysToBidding: props.daysToBidding,
    daysToNearestExam: props.daysToNearestExam,
  });

  // Everything is done. This has finished its job; it does not get to stay.
  if (complete) return null;

  return (
    <div className="data-card relative p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label={isHe ? "סגירה" : "Dismiss"}
        className="absolute end-3 top-3 rounded-md p-1 text-foreground/25 transition-colors hover:text-foreground/60"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-2.5">
        <ListChecks className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-foreground/90">
            {isHe ? "מה עוד יש כאן" : "What else is here"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/50">
            {isHe
              ? "מה שיש לו תאריך קרוב מופיע ראשון. השורות מסומנות לפי מה שכבר עשיתם."
              : "Whatever has a near date comes first. Rows tick from what you have actually done."}
          </p>

          {/* Momentum, not a score: a count and the bar that shows it. */}
          <div className="mt-3 flex items-center gap-3">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label={isHe ? "כמה מהדברים כאן כבר עשיתם" : "How much of this you have done"}
            >
              <div
                className="h-full rounded-full bg-accent-brand transition-[width] duration-500"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground/50">
              <Bidi text={`${done}/${total}`} />
            </span>
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            {moves.map((m) => {
              const copy = COPY[m.id][isHe ? "he" : "en"];
              const title = withAdvisorName(m.done ? copy[1] : copy[0], advisorName);
              const Icon = COPY[m.id].icon;
              return (
                <li key={m.id}>
                  <Link
                    href={m.href}
                    className={
                      m.done
                        ? "flex items-start gap-2.5 rounded-lg border border-transparent bg-foreground/[0.02] p-2.5 transition-colors hover:bg-foreground/[0.04]"
                        : "flex items-start gap-2.5 rounded-lg border border-border/50 bg-card/60 p-2.5 transition-colors hover:border-accent-brand/40"
                    }
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {m.done ? (
                        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : m.id === "advisor" ? (
                        <PersonaCharacter className="size-4" />
                      ) : (
                        <Icon className="size-3.5 text-foreground/40" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            m.done
                              ? "text-sm font-medium text-foreground/40 line-through decoration-foreground/20"
                              : "text-sm font-semibold text-foreground/85"
                          }
                        >
                          {title}
                        </span>
                        {m.dueInDays != null && (
                          <span className="rounded-full bg-accent-brand/15 px-1.5 py-px text-[10px] font-semibold text-accent-brand">
                            {isHe ? (
                              <>
                                בעוד <Bidi text={heNoun(m.dueInDays, "יום", "ימים")} />
                              </>
                            ) : (
                              <>
                                in <Bidi text={`${m.dueInDays}`} /> days
                              </>
                            )}
                          </span>
                        )}
                      </span>
                      {!m.done && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-foreground/55">
                          {withAdvisorName(copy[2], advisorName)}
                        </span>
                      )}
                    </span>
                    {!m.done && (
                      <ChevronLeft className="mt-1 size-3.5 shrink-0 text-foreground/25 ltr:rotate-180" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
