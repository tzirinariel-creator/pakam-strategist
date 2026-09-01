"use client";

import { Users2 } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CohortShareNudge } from "@/components/cohort/cohort-share-nudge";
import { api } from "@/lib/trpc/react";

/** #24 — one fresh line of cohort wisdom on the home screen. Quiet, honest
 *  (attributed to its cohort year), and a doorway to the full file. */
export function CohortWisdomTeaser() {
  const locale = useLocale();
  const isHe = locale === "he";
  const insights = api.cohort.listInsights.useQuery(undefined, { staleTime: 300_000 });
  const latest = insights.data?.[0];
  // Still loading — stay silent to avoid flashing the nudge before data lands.
  if (!insights.data) return null;
  // Loaded but empty: instead of silence, an honest doorway that explains the
  // file grows as the cohort shares, and invites the student to contribute what
  // they've completed. Self-hides once shared or dismissed (per-device).
  if (!latest) return <CohortShareNudge variant="card" />;
  return (
    <div className="data-card flex flex-wrap items-center gap-3 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/8 text-foreground/60">
        <Users2 className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground/60">
          {isHe
            ? `מתיק המחזור${latest.cohortYear ? ` · מחזור ${latest.cohortYear}` : ""}`
            : `From the cohort file${latest.cohortYear ? ` · class of ${latest.cohortYear}` : ""}`}
        </p>
        <p className="mt-0.5 truncate text-sm text-foreground/75">“{latest.text}”</p>
      </div>
      <Link
        href="/cohort"
        className="shrink-0 rounded-lg bg-foreground/8 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/15"
      >
        {isHe ? "לתיק המחזור" : "Open the file"}
      </Link>
    </div>
  );
}
