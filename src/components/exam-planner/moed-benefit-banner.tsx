"use client";

import { useLocale } from "next-intl";
import { CalendarCheck } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { getAcademicNow } from "@/lib/academic-calendar";
import { deriveCurrentGroup, getCurrentAcademicYear } from "@/lib/miluim";
import { MILUIM_CONFIG } from "@/lib/constants";
import { gendered, normalizeGender } from "@/lib/personal-address";

/**
 * Miluim exam benefit — the "2 of 3 sittings" right (groups B/C/G): the student
 * may sit up to 3 exam moadim and the HIGHEST grade counts (automatic), instead
 * of the usual "last grade counts" rule. It was invisible in the exam planner
 * (persona review #26). Renders ONLY for an eligible reservist; null otherwise.
 * Reads examChoice2of3 straight from MILUIM_CONFIG — no invented domain rule.
 */
export function MoedBenefitBanner() {
  const isHe = useLocale() === "he";
  const profileQuery = api.user.getProfile.useQuery();
  const semestersQuery = api.user.listMiluimSemesters.useQuery(undefined, {
    enabled: !!profileQuery.data,
  });

  const profile = profileQuery.data;
  if (!profile) return null;

  const group = deriveCurrentGroup(semestersQuery.data ?? [], profile.miluimGroup, {
    academicYear: getCurrentAcademicYear(),
    semester: getAcademicNow().semester,
  });
  if (!group || group === "NONE") return null;
  if (!MILUIM_CONFIG.GROUPS[group]?.examChoice2of3) return null;

  const gender = normalizeGender(profile.gender);
  const eligible = gendered(gender, { m: "אתה זכאי", f: "את זכאית", n: "את/ה זכאי/ת" });

  return (
    <div className="animate-stagger-2 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
        <CalendarCheck className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground/85">
          {isHe ? "הטבת מילואים במבחנים: 2 מתוך 3 מועדים" : "Miluim exam benefit: 2 of 3 sittings"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-foreground/55">
          {isHe
            ? `${eligible} לגשת ל-2 מתוך 3 מועדי בחינה, והציון הגבוה מביניהם הוא שנשמר — אוטומטית. (אצל מי שאינו מילואימניק, הציון האחרון קובע.) שווה לנצל בקורס שרוצים לשפר.`
            : "As a miluim benefit, you may sit up to 3 exam moadim, and between two of them the HIGHER grade counts — automatically, not the last one (the usual rule). Worth using on a course you want to raise."}
        </p>
      </div>
    </div>
  );
}
