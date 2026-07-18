"use client";

import { useState } from "react";
import { Loader2, Trash2, Users } from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Cohort Wisdom Section (S1b) — the cold-start engine of the social layer.
// importMyGrades existed server-side with NO UI (orphan found in the deep
// read); this is its door. Fully anonymous by construction (k-anonymous
// aggregates keyed by a one-way hash), with an equally-visible withdraw.
// ---------------------------------------------------------------

export function CohortWisdomSection() {
  const isHe = useLocale() === "he";
  const [imported, setImported] = useState<number | null>(null);
  const importGrades = api.courseKnowledge.importMyGrades.useMutation({
    onSuccess: (r) => {
      setImported(r.imported);
      toast.success(
        isHe
          ? r.imported > 0
            ? `שותפו ${r.imported} ציונים כנקודות אנונימיות`
            : "אין ציונים חדשים לשתף — הכול כבר משותף"
          : r.imported > 0
            ? `Shared ${r.imported} grades as anonymous points`
            : "Nothing new to share — everything is already in",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const withdraw = api.courseKnowledge.withdrawMyContributions.useMutation({
    onSuccess: () => {
      setImported(null);
      toast.success(isHe ? "כל התרומות שלכם נמשכו ונמחקו" : "All your contributions were withdrawn");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SectionCard
      icon={Users}
      title={isHe ? "חוכמת המחזור" : "Cohort wisdom"}
      description={
        isHe
          ? "ממוצעים אמיתיים מהמחזור — בנויים מתרומות אנונימיות של סטודנטים"
          : "Real cohort averages — built from students' anonymous contributions"
      }
    >
      <p className="text-xs leading-relaxed text-foreground/55">
        {isHe
          ? "שתפו את הציונים שלכם כנקודות אנונימיות — בלי שם, בלי דרך לשחזר מי — כדי שכולם יראו ממוצעים אמיתיים בקטלוג. ממוצע מוצג רק כשיש מספיק תורמים (5 ומעלה), ואפשר למשוך את הכול בכל רגע."
          : "Share your grades as anonymous points — no name, no way to trace back — so everyone sees real averages in the catalog. An average shows only with enough contributors (5+), and you can withdraw everything anytime."}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          onClick={() => importGrades.mutate()}
          disabled={importGrades.isPending}
          className="gap-1.5"
        >
          {importGrades.isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
          {isHe ? "שתפו את הציונים שלי" : "Share my grades"}
          {imported != null && imported > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 text-xs">{imported}</span>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => withdraw.mutate()}
          disabled={withdraw.isPending}
          className="gap-1.5"
        >
          {withdraw.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {isHe ? "משכו את כל התרומות שלי" : "Withdraw all my contributions"}
        </Button>
      </div>
    </SectionCard>
  );
}
