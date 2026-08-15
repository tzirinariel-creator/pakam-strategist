"use client";

// =========================================================================
// Bidding timeline — WHEN, not just how
// =========================================================================
// The planner already explained the mechanism and did the point arithmetic,
// but the app knew no dates at all: a student could not tell from Pakamon
// whether round 1 opens tomorrow or closed last week. This card puts the real
// תשפ״ז schedule on screen and says plainly what to do *right now*.
//
// Every date comes from bidding-calendar.ts, which quotes the two official
// documents verbatim. Nothing here estimates a date, and — per the project's
// iron rule and the guidelines' own warning that past results are "לידיעה
// בלבד ואין להסיק מהן" — nothing here predicts points.

import { heNoun } from "@/lib/he-count";
import { CalendarClock, ExternalLink, CheckCircle2, Circle, Radio } from "lucide-react";
import {
  BIDDING_ROUNDS_5787,
  BIDDING_MILESTONES_5787,
  BIDDING_LINKS,
  getBiddingPhase,
  hasCurrentBiddingCycle,
  type BiddingPhase,
} from "@/lib/bidding-calendar";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";

/** "7.9" / "15.10" — civil Israel date, no invented precision. */
function shortDate(d: Date): string {
  const il = new Date(d.getTime() + 3 * 3600_000);
  return `${il.getUTCDate()}.${il.getUTCMonth() + 1}`;
}
function hhmm(d: Date): string {
  const il = new Date(d.getTime() + 3 * 3600_000);
  return `${String(il.getUTCHours()).padStart(2, "0")}:${String(il.getUTCMinutes()).padStart(2, "0")}`;
}

/** The one sentence that tells the student what matters today. */
function headline(
  phase: BiddingPhase,
  isHe: boolean,
  cycleStillOurs: boolean,
): { title: string; body: string; tone: "urgent" | "active" | "calm" } {
  const d = phase.daysUntil ?? 0;
  const inDays = isHe
    ? d === 0 ? "היום" : d === 1 ? "מחר" : `בעוד ${heNoun(d, "יום", "ימים")}`
    : d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;

  switch (phase.kind) {
    case "before":
      return {
        tone: d <= 3 ? "urgent" : "calm",
        title: isHe ? `מקצה ${phase.round} נפתח ${inDays}` : `Round ${phase.round} opens ${inDays}`,
        body: isHe
          ? "זה זמן ההכנה: סדרו את המערכת, בדקו חפיפות, והחליטו על סדר העדיפויות — בזמן הרישום עצמו כבר לא רוצים להתלבט."
          : "This is prep time: arrange your timetable, check clashes, and settle your priorities — you don't want to be deciding once the round is live.",
      };
    case "open":
      return {
        tone: "urgent",
        title: isHe ? `מקצה ${phase.round} פתוח — נסגר ${inDays}` : `Round ${phase.round} is open — closes ${inDays}`,
        body: isHe
          ? "אפשר לשנות את ההעדפות כמה פעמים שרוצים עד הסגירה. מועד ההקלדה לא משנה — רק הניקוד."
          : "You can change your preferences as often as you like until it closes. Submission time doesn't matter — only the points do.",
      };
    case "awaiting-results":
      return {
        tone: "active",
        title: isHe ? `מקצה ${phase.round} נסגר — תוצאות ${inDays}` : `Round ${phase.round} closed — results ${inDays}`,
        body: isHe
          ? "אין מה לעשות כרגע. כשהתוצאות יפורסמו, בדקו מה התקבל ומה נדחה — ולמה."
          : "Nothing to do right now. When results land, check what got in, what was rejected, and why.",
      };
    case "between-rounds":
      return {
        tone: "active",
        title: isHe ? `מקצה ${phase.round} נפתח ${inDays}` : `Round ${phase.round} opens ${inDays}`,
        body: isHe
          ? "זה החלון לביטולים: ביטול קורס עכשיו מחזיר לכם את הנקודות שלו למקצה הבא."
          : "This is the cancellation window: dropping a course now returns its points to you for the next round.",
      };
    default:
      // "done" means done for THE CYCLE WE HOLD DATES FOR. Once that cycle's
      // changes week has closed, "הרישום בבידינג הסתיים" stops being true and
      // becomes a lie of omission — the next cycle's dates simply aren't
      // published. Say that instead of inventing them.
      return cycleStillOurs
        ? {
            tone: "calm",
            title: isHe ? "הרישום בבידינג הסתיים" : "Bidding is over",
            body: isHe
              ? "נשארו שינויים מול החוגים בשבוע השינויים, ואפשר לבטל קורסים דרך המידע האישי."
              : "Changes now go through the departments during the changes week; cancellations via your personal info page.",
          }
        : {
            tone: "calm",
            title: isHe ? "מועדי המכרז הבא עוד לא פורסמו" : "The next round's dates aren't published",
            body: isHe
              ? "התאריכים שאנחנו מחזיקים הם של מכרז תשפ״ז, והוא נסגר. כשהאוניברסיטה תפרסם את המועדים הבאים נציג אותם כאן — אנחנו לא מנחשים תאריך."
              : "The dates we hold are the 2026/27 round, which has closed. When the university publishes the next ones we'll show them here — we don't guess a date.",
          };
  }
}

export function BiddingTimeline({ isHe, now = new Date() }: { isHe: boolean; now?: Date }) {
  const phase = getBiddingPhase(now);
  const head = headline(phase, isHe, hasCurrentBiddingCycle(now));

  const steps = BIDDING_ROUNDS_5787.map((r) => {
    const done = now >= r.results;
    const live = now >= r.opens && now < r.closes;
    return {
      key: `r${r.round}`,
      live,
      done,
      label: isHe ? `מקצה ${r.round}` : `Round ${r.round}`,
      when: `${shortDate(r.opens)} ${hhmm(r.opens)} — ${shortDate(r.closes)} ${hhmm(r.closes)}`,
      results: isHe ? `תוצאות ${shortDate(r.results)}` : `Results ${shortDate(r.results)}`,
    };
  });

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        head.tone === "urgent"
          ? "border-accent-brand/40 bg-accent-brand/[0.06]"
          : "border-border/60 bg-foreground/[0.02]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <CalendarClock
          className={cn("mt-0.5 size-4 shrink-0", head.tone === "urgent" ? "text-accent-brand" : "text-foreground/45")}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-foreground/85">
            <Bidi text={head.title} />
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">{head.body}</p>

          {/* The two rounds, with real dates */}
          <ol className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-xs">
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                ) : s.live ? (
                  <Radio className="mt-0.5 size-3.5 shrink-0 animate-pulse text-accent-brand" />
                ) : (
                  <Circle className="mt-0.5 size-3.5 shrink-0 text-foreground/25" />
                )}
                <div className="min-w-0">
                  <span className={cn("font-medium", s.live ? "text-accent-brand" : "text-foreground/75")}>
                    {s.label}
                  </span>
                  <span className="text-foreground/45">
                    {" · "}
                    <Bidi text={s.when} />
                    {" · "}
                    <Bidi text={s.results} />
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-[11px] leading-relaxed text-foreground/45">
            <Bidi
              text={
                isHe
                  ? `שנה"ל נפתחת ${shortDate(BIDDING_MILESTONES_5787.yearStarts)} · ביטול רישום עד ${shortDate(BIDDING_MILESTONES_5787.cancelWindowEnd)} · שבוע שינויים ${shortDate(BIDDING_MILESTONES_5787.changesWeekStart)}–${shortDate(BIDDING_MILESTONES_5787.changesWeekEnd)}`
                  : `Year starts ${shortDate(BIDDING_MILESTONES_5787.yearStarts)} · cancel until ${shortDate(BIDDING_MILESTONES_5787.cancelWindowEnd)} · changes week ${shortDate(BIDDING_MILESTONES_5787.changesWeekStart)}–${shortDate(BIDDING_MILESTONES_5787.changesWeekEnd)}`
              }
            />
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={BIDDING_LINKS.system}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-brand hover:underline"
            >
              {isHe ? "למערכת הבידינג" : "Bidding system"}
              <ExternalLink className="size-3" />
            </a>
            <a
              href={BIDDING_LINKS.video}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-foreground/50 hover:text-foreground/75 hover:underline"
            >
              {isHe ? "הדרכה מצולמת" : "Video guide"}
              <ExternalLink className="size-3" />
            </a>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-foreground/35">
            {isHe
              ? "התאריכים מתוך ההנחיות הרשמיות של הפקולטה למדעי הרוח לתשפ״ז. פכמון לא מנחש כמה נקודות צריך — המכסה לא מתפרסמת, וגם ההנחיות עצמן אומרות שאין להסיק מתוצאות שנים קודמות."
              : "Dates from the Faculty of Humanities' official 2026/27 guidelines. Pakamon never guesses how many points a course needs — the quota isn't published, and the guidelines themselves say past results shouldn't be extrapolated."}
          </p>
        </div>
      </div>
    </div>
  );
}
