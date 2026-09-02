"use client";

// -----------------------------------------------------------------------
// English standing, said out loud in the planner
// -----------------------------------------------------------------------
// Ariel, 21.8: "אני רואה שעדיין לא מובן במסך התכנון שעשיתי אנגלית".
//
// The planner's insights bar reports credits, contact hours, campus days and
// exam gaps, and has never had a word to say about English. So a student who
// finished the English track plans a whole semester with no acknowledgement of
// it, which is indistinguishable from the app not knowing.
//
// It never says "פטור". Passing מתקדמים ב׳ finishes the LEVEL COURSES; the
// exemption itself is granted by the מזכירות, the regulation is not written
// down anywhere this repo can cite, and the rule here is that we never state
// one we cannot source. So the done state names what is true — the courses are
// finished — and names the remaining step.

import { useLocale } from "next-intl";
import { Check, Languages } from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { heNoun } from "@/lib/he-count";
import type { EnglishSignal } from "@/lib/english-planner-signal";

export function EnglishStandingChip({ signal }: { signal: EnglishSignal }) {
  const isHe = useLocale() === "he";

  // Unknown placement → render nothing. A confident "0 left" for a student we
  // know nothing about is worse than silence.
  if (signal.kind === "unknown") return null;

  const done = signal.kind === "exempt" || signal.kind === "level-track-done";

  const text = (() => {
    if (isHe) {
      if (signal.kind === "exempt") return "אנגלית — יש לכם פטור";
      if (signal.kind === "level-track-done") return "אנגלית — סיימתם את קורסי הרמה";
      return null; // the "left" case interpolates a number; built below
    }
    if (signal.kind === "exempt") return "English — you're exempt";
    if (signal.kind === "level-track-done") return "English — level courses done";
    return null;
  })();

  return (
    <div
      className={
        done
          ? "flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-1.5"
          : "flex items-center gap-2 rounded-lg border border-foreground/12 bg-foreground/[0.03] px-2.5 py-1.5"
      }
    >
      {done ? (
        <Check className="size-3.5 shrink-0 text-status-green" />
      ) : (
        <Languages className="size-3.5 shrink-0 text-foreground/60" />
      )}
      <div className="min-w-0">
        <span
          className={
            done
              ? "block text-xs font-semibold text-status-green"
              : "block text-xs font-semibold text-foreground/75"
          }
        >
          {text ??
            (isHe ? (
              <>
                אנגלית — נשאר <Bidi text={signal.remaining} />{" "}
                {heNoun(signal.remaining, "קורס רמה", "קורסי רמה")}
              </>
            ) : (
              <>
                English — {signal.remaining} level course
                {signal.remaining === 1 ? "" : "s"} left
              </>
            ))}
        </span>
        {signal.kind === "level-track-done" && (
          <span className="block text-[10px] leading-tight text-foreground/60">
            {isHe
              ? "את הפטור עצמו מאשרים במזכירות"
              : "The exemption itself is confirmed by the secretariat"}
          </span>
        )}
      </div>
    </div>
  );
}
