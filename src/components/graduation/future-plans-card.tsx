"use client";

// -----------------------------------------------------------------------
// "מה אחרי התואר" — a first version, deliberately modest
// -----------------------------------------------------------------------
// Ariel, 21.8: "אם מישהו רוצה לעשות תואר שני… או ללמוד בחו״ל. או לעבוד במשרד
// האוצר ואז כדאי לו לבחור בתחום מיקוד כלכלה. איך אתה מציע שנבצע את זה? אפשר
// לעשות משהו ראשוני ולראות איך להתנהל עם זה."
//
// The obvious build would check the student against each programme's entry
// bar. This app cannot do that honestly: it does not hold TAU's economics-MA
// requirements, any foreign university's, or the Ministry of Finance's, those
// change yearly, and inventing one would hand a student a number to plan two
// years around.
//
// So it answers the half we genuinely can. Pick a direction, and it surfaces
// what the app already knows about YOU that bears on it — average, focus area,
// English, seminars, quantitative background — and states outright that the bar
// itself has to come from the programme. The useful part was never the bar
// anyway: a first-year choosing electives wants to know which of today's
// choices are the ones that matter later.
//
// Nothing here is stored on the server yet. The choice is device-local, so a
// half-formed intention does not become a profile field the student has to
// maintain — and so we can see how it is used before designing a schema for it.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Compass, Check, CircleDashed, Circle } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import {
  DIRECTIONS,
  directionById,
  signalsFor,
  SIGNAL_LABELS,
  type DirectionId,
  type StudentFacts,
} from "@/lib/future-plans";

const STORAGE_KEY = "pk-future-direction";

export function FuturePlansCard({ facts }: { facts: StudentFacts }) {
  const isHe = useLocale() === "he";

  const [chosen, setChosen] = useState<DirectionId | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return directionById(raw)?.id ?? null;
    } catch {
      return null;
    }
  });

  const pick = (id: DirectionId) => {
    setChosen(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage blocked — the choice still holds for this view */
    }
  };

  const direction = chosen ? directionById(chosen) : null;
  const signals = useMemo(
    () => (direction ? signalsFor(direction, facts) : []),
    [direction, facts],
  );

  return (
    <div className="data-card p-5">
      <div className="flex items-start gap-2.5">
        <Compass className="mt-0.5 size-4 shrink-0 text-accent-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-foreground/90">
            {isHe ? "מה אחרי התואר" : "After the degree"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            {isHe
              ? "בחרו כיוון ונראה לכם מה כבר יש לכם שקשור אליו. זה לא בדיקת התאמה — הדרישות של כל תוכנית משתנות משנה לשנה, ואנחנו לא מחזיקים אותן."
              : "Pick a direction and we'll show what you already hold that bears on it. This is not an eligibility check — each programme's requirements change yearly, and we do not hold them."}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {DIRECTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d.id)}
                aria-pressed={chosen === d.id}
                className={
                  chosen === d.id
                    ? "rounded-full border border-accent-brand bg-accent-brand/10 px-3 py-1.5 text-xs font-semibold text-accent-brand"
                    : "rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/65 transition-colors hover:border-foreground/30"
                }
              >
                {isHe ? d.he : d.en}
              </button>
            ))}
          </div>

          {direction && (
            <div className="mt-3.5">
              <p className="text-xs leading-relaxed text-foreground/60">
                {isHe ? direction.whyHe : direction.whyEn}
              </p>

              <ul className="mt-2.5 flex flex-col gap-1.5">
                {signals.map((s) => {
                  const Icon =
                    s.state === "done" ? Check : s.state === "in-progress" ? CircleDashed : Circle;
                  const tone =
                    s.state === "done"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : s.state === "in-progress"
                        ? "text-foreground/60"
                        : "text-foreground/60";
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
                    >
                      <Icon className={`size-3.5 shrink-0 ${tone}`} />
                      <span className="min-w-0 flex-1 text-xs text-foreground/70">
                        {isHe ? SIGNAL_LABELS[s.id].he : SIGNAL_LABELS[s.id].en}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${tone}`}>
                        <Bidi text={isHe ? s.valueHe : s.valueEn} />
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* The one requirement we DO hold, above the line that says we
                  hold none of the others — because it is the exception that
                  makes that line credible rather than a blanket shrug. It
                  carries its source on screen: a course requirement stated
                  without one is exactly what this app refuses to print. */}
              {direction.gate && (
                <div className="mt-2.5 rounded-lg border border-accent-brand/25 bg-accent-brand/[0.06] p-2.5">
                  <p className="text-[11px] font-semibold leading-relaxed text-foreground/80">
                    {isHe ? direction.gate.he : direction.gate.en}
                  </p>
                  <p className="mt-1 text-[10px] text-foreground/60">
                    {isHe ? direction.gate.sourceHe : direction.gate.sourceEn}
                  </p>
                </div>
              )}

              {/* The boundary, stated where the reader is forming a plan
                  rather than buried at the bottom of the page. */}
              <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/60">
                {isHe
                  ? "מה שהתוכנית עצמה דורשת — ממוצע מינימלי, קורסי חובה, מבחני כניסה — נמצא רק אצלה. בדקו באתר שלה לפני שמתכננים לפי זה."
                  : "What the programme itself requires — a minimum average, prerequisite courses, entrance exams — lives only with them. Check their site before planning around it."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
