"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Trash2,
  EyeOff,
  Flag,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * OPS3 — the moderation queue for cohort reviews. Reviews auto-hide after
 * 3 reports; this is where the admin approves (restore + clear reports) or
 * deletes them. Admin-only surface → Hebrew-hardcoded like /admin/sync.
 * Reviewer identity is intentionally absent (anonymous cohort wisdom).
 */
export function ModerationQueue() {
  const utils = api.useUtils();
  const queue = api.admin.getModerationQueue.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const approve = api.admin.approveReview.useMutation({
    onSuccess: () => utils.admin.getModerationQueue.invalidate(),
  });
  const remove = api.admin.deleteReview.useMutation({
    onSuccess: () => {
      setConfirmDeleteId(null);
      utils.admin.getModerationQueue.invalidate();
    },
  });

  const cohortQueue = api.admin.getCohortModerationQueue.useQuery();
  const modInsight = api.admin.moderateCohortInsight.useMutation({
    onSuccess: () => utils.admin.getCohortModerationQueue.invalidate(),
  });
  const modPlan = api.admin.moderateCohortPlan.useMutation({
    onSuccess: () => utils.admin.getCohortModerationQueue.invalidate(),
  });

  if (queue.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-foreground/60">
        <Loader2 className="size-4 animate-spin" />
        טוען את תור המודרציה…
      </div>
    );
  }

  const items = queue.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground/90">
          <ShieldCheck className="size-6 text-foreground/60" />
          מודרציית חוות-דעת
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          חוות-דעת שהוסתרו אוטומטית (3 דיווחים) או שנצברו עליהן דיווחים. אשרו —
          והן חוזרות להיות גלויות עם ספירת-דיווחים נקייה; מחקו — והן נעלמות לצמיתות.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="data-card flex items-center gap-3 p-6 text-sm text-foreground/60">
          <CheckCircle2 className="size-5 text-status-green" />
          התור ריק — אין חוות-דעת מדווחות או מוסתרות.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="data-card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground/90">
                  {r.courseName ?? r.courseCode}
                </span>
                <span className="font-mono text-xs text-foreground/60">
                  {r.courseCode}
                </span>
                {r.status === "HIDDEN" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-status-red">
                    <EyeOff className="size-3" />
                    מוסתרת
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-status-amber">
                    <Flag className="size-3" />
                    גלויה + דיווחים
                  </span>
                )}
                <span className="text-xs text-foreground/60">
                  {r.reportCount} דיווחים
                </span>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-foreground/60">
                {r.workload != null && <span>עומס: {r.workload}/5</span>}
                {r.difficulty != null && <span>קושי: {r.difficulty}/5</span>}
                {r.verdict && <span>המלצה: {r.verdict}</span>}
                {r.cohortYear != null && <span>מחזור: {r.cohortYear}</span>}
              </div>

              {r.tip && (
                <p className="rounded-lg bg-foreground/5 p-3 text-sm leading-relaxed text-foreground/80">
                  {r.tip}
                </p>
              )}

              {r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {r.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-border/40 pt-3">
                <button
                  type="button"
                  onClick={() => approve.mutate({ reviewId: r.id })}
                  disabled={approve.isPending || remove.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-status-green transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  <CheckCircle2 className="size-3.5" />
                  אישור והחזרה לתצוגה
                </button>
                <button
                  type="button"
                  onClick={() =>
                    confirmDeleteId === r.id
                      ? remove.mutate({ reviewId: r.id })
                      : setConfirmDeleteId(r.id)
                  }
                  disabled={approve.isPending || remove.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                    confirmDeleteId === r.id
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-red-500/10 text-status-red hover:bg-red-500/20",
                  )}
                >
                  <Trash2 className="size-3.5" />
                  {confirmDeleteId === r.id ? "בטוחים? מחיקה לצמיתות" : "מחיקה"}
                </button>
                {confirmDeleteId === r.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs text-foreground/60 hover:text-foreground/80"
                  >
                    ביטול
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cohort content queue (insights + shared plans) */}
      {((cohortQueue.data?.insights.length ?? 0) > 0 || (cohortQueue.data?.plans.length ?? 0) > 0) && (
        <div className="space-y-3 border-t border-border/40 pt-6">
          <h2 className="font-display text-xl font-bold text-foreground/85">תוכן קהילתי מדווח</h2>
          {cohortQueue.data!.insights.map((r) => (
            <div key={r.id} className="data-card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                <span className="rounded-full bg-foreground/8 px-2 py-0.5">תובנה · {r.stage}</span>
                <span className={r.status === "HIDDEN" ? "text-status-red" : "text-status-amber"}>
                  {r.status === "HIDDEN" ? "מוסתרת" : "מדווחת"} · {r.reportCount} דיווחים
                </span>
              </div>
              <p className="rounded-lg bg-foreground/5 p-3 text-sm text-foreground/80">{r.text}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => modInsight.mutate({ id: r.id, action: "approve" })}
                  className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-status-green hover:bg-emerald-500/25">אישור</button>
                <button type="button" onClick={() => modInsight.mutate({ id: r.id, action: "delete" })}
                  className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-status-red hover:bg-red-500/20">מחיקה</button>
              </div>
            </div>
          ))}
          {cohortQueue.data!.plans.map((r) => (
            <div key={r.id} className="data-card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                <span className="rounded-full bg-foreground/8 px-2 py-0.5">מסלול</span>
                <span className={r.status === "HIDDEN" ? "text-status-red" : "text-status-amber"}>
                  {r.status === "HIDDEN" ? "מוסתר" : "מדווח"} · {r.reportCount} דיווחים
                </span>
              </div>
              <p className="text-sm font-medium text-foreground/85">{r.title}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => modPlan.mutate({ id: r.id, action: "approve" })}
                  className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-status-green hover:bg-emerald-500/25">אישור</button>
                <button type="button" onClick={() => modPlan.mutate({ id: r.id, action: "delete" })}
                  className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-status-red hover:bg-red-500/20">מחיקה</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
