"use client";

// -----------------------------------------------------------------------
// "מה עוד יש כאן" — so a student stops missing half the app
// -----------------------------------------------------------------------
// Ariel: "בתור סטודנט מתחיל נגיד — לא הייתי יודע שיש דבר כזה תכנון מבחנים" ·
// "סיימתי את כל ההגדרות וכו — ולא התנסיתי במלך… אני לא מספיק מכיר ויכול לנצל
// את האפליקציה במיטבה."
//
// Deliberately NOT a feature tour, a carousel, or a modal on login. It is a
// short list on the dashboard that reorders itself by the academic calendar,
// so the thing at the top is the thing that matters this fortnight — and it
// disappears entirely once everything trackable has been used.
//
// Each row says what the feature DOES in the student's terms, not what it is
// called. "תכנון מבחנים" means nothing to someone who has never seen it;
// "לפרוס את החזרה על החומר על פני הימים שנשארו" means something immediately.

import { useLocale } from "next-intl";
import Link from "next/link";
import { Check, ChevronLeft, Compass } from "lucide-react";
import {
  featureDiscovery,
  triedCount,
  type FeatureDiscoveryInput,
  type FeatureId,
} from "@/lib/feature-discovery";
import { heNoun } from "@/lib/he-count";
import { Bidi } from "@/lib/bidi";

const COPY: Record<FeatureId, { he: [string, string]; en: [string, string] }> = {
  bidding: {
    he: ["המכרז", "שני הסמסטרים זה לצד זה, עם התאריכים ורשימה מוכנה להעתקה"],
    en: ["Bidding", "Both semesters side by side, with the dates and a list ready to copy"],
  },
  examPlanner: {
    he: ["תכנון מבחנים", "לפרוס את החזרה על החומר על פני הימים שנשארו, לפי המועדים שלכם"],
    en: ["Exam planning", "Spread revision across the days you have, around your real sittings"],
  },
  king: {
    he: ["המלך הפילוסוף", "לשאול כל שאלה על התואר ולקבל תשובה מהנתונים שלכם עצמם"],
    en: ["The Philosopher King", "Ask anything about your degree, answered from your own data"],
  },
  simulator: {
    he: ["סימולציית ציונים", "לראות מה קורה לממוצע אם ציון אחד ישתנה — לפני שמחליטים על מועד ב׳"],
    en: ["Grade simulation", "See what one grade does to the average — before deciding on a resit"],
  },
  cohort: {
    he: ["תיק המחזור", "מה שסטודנטים לפניכם כתבו על הקורסים, בלי שמות"],
    en: ["The cohort file", "What students before you wrote about the courses, without names"],
  },
  lineage: {
    he: ["השושלת", "מי היה לפניכם, איפה אתם, ומי יבוא אחריכם"],
    en: ["The lineage", "Who came before you, where you are, and who comes next"],
  },
  calendarSync: {
    he: ["סנכרון ליומן", "המערכת והמבחנים ביומן שלכם, בלי להקליד כלום"],
    en: ["Calendar sync", "Your timetable and exams in your own calendar, with no typing"],
  },
  miluim: {
    he: ["ההטבות שלכם", "מה מגיע לכם לפי המתווה — ומה מהן קורה אוטומטית"],
    en: ["Your entitlements", "What the reservist outline grants you, and which parts are automatic"],
  },
};

export function FeatureDiscoveryCard(input: FeatureDiscoveryInput) {
  const isHe = useLocale() === "he";
  const entries = featureDiscovery(input);
  const { tried, knowable } = triedCount(entries);

  // Once every trackable feature has been used, this has done its job and
  // should stop taking up the dashboard. A permanent "discover our features"
  // panel is an advert, not a help.
  if (knowable > 0 && tried === knowable) return null;
  if (entries.length === 0) return null;

  return (
    <div className="data-card p-5">
      <div className="flex items-start gap-2.5">
        <Compass className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-bold text-foreground/90">
              {isHe ? "מה עוד יש כאן" : "What else is here"}
            </h3>
            {knowable > 0 && (
              <span className="text-xs tabular-nums text-foreground/45">
                <Bidi text={`${tried}/${knowable}`} />
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/50">
            {isHe
              ? "מסודר לפי מה שרלוונטי עכשיו בלוח השנה — מה שקרוב, קודם."
              : "Ordered by what the calendar makes relevant — the nearest thing first."}
          </p>

          <ul className="mt-3 flex flex-col gap-1.5">
            {entries.slice(0, 5).map((e) => {
              const copy = COPY[e.id][isHe ? "he" : "en"];
              return (
                <li key={e.id}>
                  <Link
                    href={e.href}
                    className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-card/60 p-2.5 transition-colors hover:border-accent-brand/40"
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {e.tried === true ? (
                        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ChevronLeft className="size-3.5 rotate-180 text-foreground/30" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground/85">{copy[0]}</span>
                        {e.urgentDays != null && (
                          <span className="rounded-full bg-accent-brand/15 px-1.5 py-px text-[10px] font-semibold text-accent-brand">
                            {isHe ? (
                              <>
                                בעוד {heNoun(e.urgentDays, "יום", "ימים")}
                              </>
                            ) : (
                              <>in {e.urgentDays} days</>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-foreground/55">
                        {copy[1]}
                      </span>
                    </span>
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
