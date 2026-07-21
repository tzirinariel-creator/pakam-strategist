"use client";

import { Gavel } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getBiddingTarget, isBiddingSeason } from "@/lib/bidding-target";
import { api } from "@/lib/trpc/react";

/** #15 — seasonal bidding nudge. Window-based (≤45 days to the next teaching
 *  start); never claims an exact bid date (TAU doesn't publish one). */
export function BiddingSeasonCard() {
  const locale = useLocale();
  const isHe = locale === "he";
  const profileQuery = api.user.getProfile.useQuery();
  const target = getBiddingTarget(profileQuery.data?.startYear, profileQuery.data?.currentYear ?? 1);
  if (!isBiddingSeason(target) || !target) return null;
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
            ? `ההוראה נפתחת בעוד ${target.daysUntilStart} ימים, וההרשמה מתקיימת לפני כן. שווה לסגור את התוכנית ולבדוק חפיפות עכשיו.`
            : `Teaching starts in ${target.daysUntilStart} days and registration happens before. Finalize your plan and check clashes now.`}
        </p>
      </div>
      <Link
        href="/planner"
        className="shrink-0 rounded-lg bg-accent-brand px-3 py-2 text-xs font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
      >
        {isHe ? "לבדיקת חפיפות" : "Check clashes"}
      </Link>
    </div>
  );
}
