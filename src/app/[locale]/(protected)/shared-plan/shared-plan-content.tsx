"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Share2, Copy, AlertTriangle, GraduationCap } from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { decodePlan } from "@/lib/plan-share";
import { SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { ThemedLoader } from "@/components/ui/themed-loader";

export function SharedPlanContent() {
  const isHe = useLocale() === "he";
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("d") ?? "";

  const shared = useMemo(() => decodePlan(token), [token]);
  const coursesQuery = api.course.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const [confirming, setConfirming] = useState(false);
  const importMutation = api.plan.savePlan.useMutation({
    onSuccess: (r) => {
      toast.success(isHe ? `הועתקו ${r.savedCount} קורסים לתכנון שלך` : `Imported ${r.savedCount} courses`);
      router.push("/planner");
    },
    onError: () => toast.error(isHe ? "ההעתקה נכשלה" : "Import failed"),
  });

  // Resolve shared course codes → real courses.
  const resolved = useMemo(() => {
    if (!shared || !coursesQuery.data) return [];
    const byCode = new Map((coursesQuery.data as { id: string; code: string; nameHe: string; nameEn: string | null; credits: number }[]).map((c) => [c.code, c]));
    return shared
      .map((s) => {
        const c = byCode.get(s.c);
        return c ? { ...s, id: c.id, name: isHe ? c.nameHe : (c.nameEn ?? c.nameHe), credits: c.credits } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [shared, coursesQuery.data, isHe]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof resolved>();
    for (const c of resolved) {
      const key = `${c.y}-${c.s}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [resolved]);

  const totalCredits = resolved.reduce((s, c) => s + c.credits, 0);

  const handleImport = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    importMutation.mutate({
      courses: resolved.map((c) => ({ courseId: c.id, plannedYear: c.y, plannedSemester: c.s })),
    });
  };

  if (!shared) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-10 text-amber-400" />
        <p className="text-sm text-foreground/60">
          {isHe ? "הקישור לא תקין או פג." : "This share link is invalid or expired."}
        </p>
      </div>
    );
  }

  if (coursesQuery.isLoading) return <ThemedLoader />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
          <Share2 className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground/85">
            {isHe ? "תכנון תואר משותף" : "A shared degree plan"}
          </h1>
          <p className="text-xs text-foreground/50" dir="ltr">
            {resolved.length} {isHe ? "קורסים" : "courses"} · {totalCredits} {isHe ? "ש״ס" : "cr."}
          </p>
        </div>
      </div>

      {grouped.map(([key, courses]) => {
        const [y, s] = key.split("-");
        const yearLabel = YEAR_CONFIG[Number(y) as 1 | 2 | 3]?.[isHe ? "nameHe" : "nameEn"] ?? `Year ${y}`;
        const semLabel = SEMESTER_CONFIG[s as keyof typeof SEMESTER_CONFIG]?.[isHe ? "nameHe" : "nameEn"] ?? s;
        return (
          <div key={key} className="data-card p-4">
            <h3 className="mb-2 text-sm font-bold text-foreground/75">
              {yearLabel} · {semLabel}
            </h3>
            <div className="space-y-1.5">
              {courses.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <GraduationCap className="size-3.5 shrink-0 text-foreground/35" />
                  <span className="min-w-0 flex-1 truncate text-foreground/80">{c.name}</span>
                  <span className="shrink-0 font-mono text-xs text-foreground/40">{c.credits}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="data-card flex flex-col gap-2 p-4">
        {confirming && (
          <p className="flex items-start gap-2 text-xs text-amber-600">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {isHe
              ? "שים לב: ההעתקה תחליף את התכנון הנוכחי שלך. ללחוץ שוב כדי לאשר."
              : "Heads up: importing replaces your current plan. Click again to confirm."}
          </p>
        )}
        <button
          type="button"
          onClick={handleImport}
          disabled={resolved.length === 0 || importMutation.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-brand px-4 py-2.5 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
        >
          <Copy className="size-4" />
          {importMutation.isPending
            ? isHe ? "מעתיק…" : "Importing…"
            : confirming
              ? isHe ? "כן, החלף את התכנון שלי" : "Yes, replace my plan"
              : isHe ? "העתק לתכנון שלי" : "Copy to my plan"}
        </button>
      </div>
    </div>
  );
}
