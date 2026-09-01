"use client";

import { Gavel } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getBiddingTarget, isBiddingSeason } from "@/lib/bidding-target";
import { isBiddingRelevant, hasCurrentBiddingCycle } from "@/lib/bidding-calendar";
import { BiddingTimeline } from "@/components/planner/bidding-timeline";
import { api } from "@/lib/trpc/react";
import { daysUntilLabel } from "@/lib/days-until";

/**
 * The home screen's registration surface.
 *
 * 13.8 (Ariel): "אני באפליקציה כבר די הרבה זמן והוא עוד לא דיבר איתי מילה על
 * הבידינג". The machinery was all there — bidding-calendar.ts holds the real
 * תשפ״ז rounds and bidding-timeline.tsx renders them — but the ONLY mount was
 * far down /planner, and this card keyed off `isBiddingSeason` = "≤45 days to
 * the next TEACHING start". Teaching opens 18.10.26 while round 1 opens 7.9.26
 * and closes 15.9.26, so through August, with the round three weeks away, the
 * home screen was silent; and the same proxy would still say "bidding is near"
 * for the twelve days after round 2's results.
 *
 * Now: when we hold PUBLISHED dates covering today, home shows the real
 * timeline. The old window card survives only as the fallback for cycles we
 * have no dates for — it claims no date, and it stays silent off-season.
 */
export function BiddingSeasonCard({
  /** True when the season hero above already carries the registration ask. */
  heroOwnsBidding = false,
  now = new Date(),
}: {
  heroOwnsBidding?: boolean;
  now?: Date;
} = {}) {
  const locale = useLocale();
  const isHe = locale === "he";
  const profileQuery = api.user.getProfile.useQuery();
  const target = getBiddingTarget(profileQuery.data?.startYear, profileQuery.data?.currentYear ?? 1);

  // Past year 3 there is nothing left to register for — the same gate the
  // hero uses, so the two never disagree.
  if (!target) return null;

  // Published dates that cover today → the timeline, on the home screen. It
  // says something the one-line hero cannot (which round, opening and closing
  // to the hour, what to do in this phase), so it is not a duplicate ask.
  if (isBiddingRelevant(now)) {
    // When the hero already carries the countdown, this card keeps the part
    // the hero cannot show — the two rounds with their hours, the milestones,
    // the links — and drops the sentence they were both saying.
    return <BiddingTimeline isHe={isHe} now={now} hideHeadline={heroOwnsBidding} />;
  }

  // Published dates that say the rounds are FINISHED outrank the window proxy
  // — otherwise this card would go on announcing "the bidding is near" for the
  // twelve days between round 2's results and the year opening.
  if (hasCurrentBiddingCycle(now)) return null;

  // No published dates for this cycle. Fall back to the honest window wording
  // — but never next to the hero saying the same thing.
  if (heroOwnsBidding || !isBiddingSeason(target)) return null;

  return (
    <div className="data-card flex flex-wrap items-center gap-3 border-accent-brand/25 bg-accent-brand/[0.04] p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-brand/15 text-accent-brand">
        <Gavel className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground/85">
          {isHe
            ? `המכרז ל${target.labelHe} מתקרב`
            : `Bidding for the coming ${target.semester === "FALL" ? "fall" : "spring"} is near`}
        </p>
        <p className="text-xs text-foreground/55">
          {isHe
            ? `ההוראה נפתחת ${daysUntilLabel(target.daysUntilStart, true)}, וההרשמה מתקיימת לפני כן. שווה לסגור את התוכנית ולבדוק חפיפות עכשיו.`
            : `Teaching starts ${daysUntilLabel(target.daysUntilStart, false)} and registration happens before. Finalize your plan and check clashes now.`}
        </p>
      </div>
      <Link
        href="/bidding"
        className="shrink-0 rounded-lg bg-accent-brand px-3 py-2 text-xs font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
      >
        {isHe ? "לבדיקת חפיפות" : "Check clashes"}
      </Link>
    </div>
  );
}
