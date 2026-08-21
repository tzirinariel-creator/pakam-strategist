"use client";

import { heNoun } from "@/lib/he-count";
import { useState, useEffect } from "react";
import { Shield, Loader2, Check, Swords } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { getAcademicNow, hebrewYearLabel } from "@/lib/academic-calendar";
import { Bidi } from "@/lib/bidi";
import { MILUIM_CONFIG } from "@/lib/constants";
import { deriveGroupFromDays, getCurrentAcademicYear, splitByDegreeStart } from "@/lib/miluim";
import { MiluimDayCombatInputs } from "@/components/miluim/miluim-day-combat-inputs";
import { QuotaCard } from "@/components/miluim/quota-card";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "./section-card";
import { Form3010Uploader } from "./form-3010-uploader";

// ---------------------------------------------------------------
// Miluim Section — current-semester group + cumulative quota tracker
// ---------------------------------------------------------------

export function MiluimSection() {
  const t = useTranslations("settings.miluim");
  const locale = useLocale();
  const isHe = locale === "he";
  const utils = api.useUtils();

  const profileQuery = api.user.getProfile.useQuery();
  const semestersQuery = api.user.listMiluimSemesters.useQuery();

  const [days, setDays] = useState<number | null>(null);
  const [combat, setCombat] = useState(false);
  const [saved, setSaved] = useState(false);

  // Cumulative quota counters — student-editable (the army doesn't feed these,
  // so without a way to enter them the degree cap / PKM-024 / PKM-025 stay inert).
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [binaryUsedInput, setBinaryUsedInput] = useState<number | null>(null);
  // Manual group override for special cases the day-model can't capture
  // (career service / 300+ days → C, bereaved/wounded → G) — #9.
  const [manualGroup, setManualGroup] = useState<string>("NONE");

  // The current academic year + semester come from the profile; the current
  // miluim row (if any) seeds the day/combat inputs. SUMMER has no miluim row
  // of its own (fix E) — fold it onto SPRING so the editor reads/writes the
  // same bucket group resolution uses.
  // Resolve the CURRENT semester from the real-time calendar — the SAME source
  // plan.getCredits + regulation.checkCompliance use to pick the MiluimSemester
  // row. Deriving it from the stale stored profile.currentSemester wrote the
  // student's days into the wrong (previous) semester row after a rollover, so
  // they granted 0 exemption everywhere despite the preview (#audit-r4).
  const nowSemester = getAcademicNow().semester;
  const editorSemester: "FALL" | "SPRING" = nowSemester === "SPRING" ? "SPRING" : "FALL";
  const academicYear = getCurrentAcademicYear();
  // #7/#37 — every miluim surface reads the SAME degree window, so a row from
  // before the student enrolled can't show up in one place and vanish in
  // another. Unknown startYear ⇒ nothing is filtered (we never guess).
  const startYear = profileQuery.data?.startYear ?? null;
  const degreeSemesters = splitByDegreeStart(semestersQuery.data ?? [], startYear).degree;

  // Human-readable label of the record being edited (academic year + semester).
  // Derived from academicYear (not hardcoded) so it stays correct across the
  // rollover to תשפ"ז and beyond (#audit-r4).
  const academicYearLabel = isHe
    ? `${hebrewYearLabel(academicYear)} (${academicYear}/${academicYear + 1})`
    : `${academicYear}/${academicYear + 1}`;
  const semesterLabel = isHe
    ? editorSemester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"
    : editorSemester === "FALL" ? "Fall" : "Spring";

  // Seed inputs from the matching per-semester row once data loads.
  useEffect(() => {
    const rows = semestersQuery.data;
    if (!rows) return;
    const row = rows.find(
      (r) => r.academicYear === academicYear && r.semester === editorSemester
    );
    if (row) {
      setDays(row.daysServed);
      setCombat(row.isCombat);
    }
  }, [semestersQuery.data, academicYear, editorSemester]);

  // Seed the cumulative counters from the profile once loaded.
  useEffect(() => {
    if (!profileQuery.data) return;
    setCreditsUsed(profileQuery.data.miluimCreditsUsed ?? 0);
    setBinaryUsedInput(profileQuery.data.miluimBinaryUsed ?? 0);
    setManualGroup(
      profileQuery.data.miluimCareerService
        ? "CAREER_SERVICE"
        : (profileQuery.data.miluimGroup ?? "NONE")
    );
  }, [profileQuery.data]);

  const upsertMutation = api.user.upsertMiluimSemester.useMutation({
    onSuccess: () => {
      void utils.user.listMiluimSemesters.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(t("saved"));
    },
    onError: () => advisorError(isHe ? "השמירה לא הצליחה — נסו שוב. שום דבר לא אבד." : "The save didn't go through — try again. Nothing was lost."),
  });
  // Quiet twins for the 3010 UNDO path — restoring N rows must not fire N
  // "saved" toasts; ONE invalidate at the end.
  const silentUpsert = api.user.upsertMiluimSemester.useMutation();
  const silentDelete = api.user.deleteMiluimSemester.useMutation();
  const restoreSnapshot = (
    snapshot: Array<{ prior: { academicYear: number; semester: "FALL" | "SPRING"; daysServed: number; isCombat: boolean } | null; academicYear: number; semester: "FALL" | "SPRING" }>,
  ) => {
    void Promise.allSettled(
      snapshot.map((s) =>
        s.prior
          ? silentUpsert.mutateAsync(s.prior)
          : silentDelete.mutateAsync({ academicYear: s.academicYear, semester: s.semester }),
      ),
    ).then(() => {
      void utils.user.listMiluimSemesters.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
      toast.success(isHe ? "הייבוא בוטל — הנתונים חזרו למצב הקודם" : "Import undone — data restored");
    });
  };
  const snapshotOf = (academicYear: number, semester: "FALL" | "SPRING") => {
    const row = (semestersQuery.data ?? []).find(
      (r) => r.academicYear === academicYear && r.semester === semester,
    );
    return row
      ? { academicYear: row.academicYear, semester: row.semester as "FALL" | "SPRING", daysServed: row.daysServed, isCombat: row.isCombat ?? false }
      : null;
  };

  const updateProfileMutation = api.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate();
      void utils.plan.getCredits.invalidate();
      void utils.regulation.checkCompliance.invalidate();
      toast.success(t("saved"));
    },
    onError: () => toast.error(isHe ? "השמירה נכשלה" : "Save failed"),
  });

  // Derived group preview from the current inputs (mirrors onboarding).
  const derivedGroup = deriveGroupFromDays(days ?? 0, combat);
  const groupCfg = MILUIM_CONFIG.GROUPS[derivedGroup];
  const groupName = isHe ? groupCfg.nameHe : groupCfg.nameEn;

  // Cumulative quota caps.
  const creditCap = MILUIM_CONFIG.MAX_CREDIT_EXEMPTIONS_DEGREE; // 10
  const binaryCap = MILUIM_CONFIG.BINARY_GRADE.BA_DEGREE_CAP; // 5

  const handleSave = () => {
    upsertMutation.mutate({
      academicYear,
      semester: editorSemester,
      daysServed: days ?? 0,
      isCombat: combat,
    });
  };

  // Mount gate: the section holds Radix Selects, and its per-semester list
  // renders conditionally on client-hydrated query data (which SSR doesn't
  // have). That shifts Radix's internal useId between server and client and
  // trips a hydration mismatch on aria-controls (#6). Rendering an identical
  // skeleton on SSR + the first client render, then the real content after
  // mount, keeps the trees in sync — the Selects only appear post-hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <SectionCard icon={Shield} title={t("title")} description={t("description")}>
        <div className="h-40 animate-pulse rounded-xl bg-foreground/[0.03]" />
      </SectionCard>
    );
  }

  return (
    <SectionCard icon={Shield} title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-5">
        {/* Which record is being edited — academic year + semester (fix C) */}
        <div className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/3 px-4 py-2.5">
          <span className="text-xs text-foreground/50">{t("editingRecord")}</span>
          <span className="text-xs font-medium text-foreground/70">
            <Bidi text={academicYearLabel} /> · {semesterLabel}
          </span>
        </div>

        {/* Day + combat inputs (shared with onboarding) */}
        <MiluimDayCombatInputs
          days={days}
          combat={combat}
          onDaysChange={setDays}
          onCombatChange={setCombat}
          labels={{
            daysLabel: t("daysServed"),
            daysHint: t("daysServedHint"),
            combatLabel: t("combat"),
            combatYes: t("combatYes"),
            combatNo: t("combatNo"),
          }}
        />

        {/* Derived current group */}
        <div className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/3 px-4 py-3">
          <span className="text-sm text-foreground/60">{t("currentGroup")}</span>
          <span className="text-sm font-medium text-foreground/80">
            {(days ?? 0) > 0 ? <Bidi text={groupName} /> : t("noService")}
          </span>
        </div>

        {/* Save current-semester group */}
        <Button
          onClick={handleSave}
          disabled={upsertMutation.isPending}
          className="self-start"
        >
          {upsertMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saved ? (
            <Check className="size-4" />
          ) : null}
          {saved ? t("saved") : t("save")}
        </Button>

        {/* M2 (note 45) — Form 3010 scanner: upload the official confirmation,
            Gemini extracts the periods, and EVERY semester is applied only on
            explicit approval (through the same upsert the manual editor uses). */}
        <Form3010Uploader
          isHe={isHe}
          existing={semestersQuery.data ?? []}
          pending={upsertMutation.isPending}
          startYear={startYear}
          // The 3010 can only refuse everything when the degree anchor is
          // wrong, so the correction belongs on that same panel rather than
          // three screens away (Ariel, 21.8 — his only recoverable move was
          // deleting the account).
          onSetStartYear={(y) => updateProfileMutation.mutate({ startYear: y })}
          onApply={(academicYearApply, semesterApply, daysApply) => {
            const prior = snapshotOf(academicYearApply, semesterApply);
            upsertMutation.mutate(
              {
                academicYear: academicYearApply,
                semester: semesterApply,
                daysServed: daysApply,
                // Preserve an existing combat flag — the form doesn't state it.
                isCombat: prior?.isCombat ?? false,
              },
              {
                onSuccess: () =>
                  toast.success(isHe ? "הסמסטר עודכן מהטופס" : "Semester applied from the form", {
                    action: {
                      label: isHe ? "בטלו" : "Undo",
                      onClick: () => restoreSnapshot([{ prior, academicYear: academicYearApply, semester: semesterApply }]),
                    },
                  }),
              },
            );
          }}
          onApplyAll={(items) => {
            // Snapshot EVERYTHING before the first write — one tap restores all.
            const snapshot = items.map((it) => ({
              prior: snapshotOf(it.academicYear, it.semester),
              academicYear: it.academicYear,
              semester: it.semester,
            }));
            void Promise.allSettled(
              items.map((it) =>
                silentUpsert.mutateAsync({
                  academicYear: it.academicYear,
                  semester: it.semester,
                  daysServed: it.days,
                  isCombat: snapshot.find((s) => s.academicYear === it.academicYear && s.semester === it.semester)?.prior?.isCombat ?? false,
                }),
              ),
            ).then((results) => {
              void utils.user.listMiluimSemesters.invalidate();
              void utils.plan.getCredits.invalidate();
              void utils.regulation.checkCompliance.invalidate();
              const ok = results.filter((r) => r.status === "fulfilled").length;
              toast.success(
                isHe ? `הוחלו ${heNoun(ok, "סמסטר", "סמסטרים")} מהטופס` : `Applied ${ok} semesters from the form`,
                {
                  action: {
                    label: isHe ? "בטלו הכול" : "Undo all",
                    onClick: () => restoreSnapshot(snapshot),
                  },
                },
              );
            });
          }}
        />

        {/* Per-semester service timeline (#12/#3) — so the student sees their
            WHOLE reserve history, not just the one semester being edited. */}
        {degreeSemesters.length > 0 && (
          <div className="border-t border-border pt-5">
            <h4 className="mb-1 text-sm font-medium text-foreground/70">
              {isHe ? "השירות שלכם מאז תחילת התואר" : "Your service since the degree began"}
            </h4>
            <p className="mb-2 text-[11px] text-foreground/45">
              {isHe
                ? "שורה לכל סמסטר — הקבוצה נקבעת מחדש בכל סמסטר לפי הימים שבו."
                : "One row per semester — the group is re-derived each semester from that semester's days."}
            </p>
            <div className="flex flex-col gap-1.5">
              {[...degreeSemesters]
                .sort((a, b) =>
                  a.academicYear - b.academicYear ||
                  (a.semester === "FALL" ? -1 : 1)
                )
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2 text-xs"
                  >
                    <span className="text-foreground/70">
                      <Bidi
                        text={
                          isHe
                            ? `${hebrewYearLabel(s.academicYear)} · ${s.semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳"}`
                            : `${s.academicYear}/${s.academicYear + 1} · ${s.semester === "FALL" ? "Fall" : "Spring"}`
                        }
                      />
                    </span>
                    <span className="flex items-center gap-2 text-foreground/60">
                      <span>
                        <bdi dir="ltr">{s.daysServed}</bdi> {isHe ? "ימים" : "days"}
                      </span>
                      {s.isCombat && (
                        <span className="text-amber-500">{isHe ? "תפקיד לחימה" : "combat"}</span>
                      )}
                      <span className="rounded-full bg-foreground/8 px-2 py-0.5 font-bold text-foreground/70">
                        {s.derivedGroup === "NONE"
                          ? "—"
                          : `${isHe ? "קבוצה " : "Group "}${s.derivedGroup.replace("GROUP_", "")}`}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Manual group override — special cases the day-model doesn't capture:
            career service / 300+ days since 7.10.23 → C; bereaved/wounded → G (#9).
            Writes the fallback user.miluimGroup; a per-semester days row, if any,
            still takes precedence for that semester. */}
        <div className="border-t border-border pt-5">
          <label
            id="miluim-manual-group-label"
            className="mb-1.5 block text-sm font-medium text-foreground/70"
          >
            {isHe ? "סיווג ידני (מקרים מיוחדים)" : "Manual group (special cases)"}
          </label>
          <p className="mb-2.5 text-xs text-foreground/45">
            {isHe
              ? <Bidi text="מקרים מיוחדים: 300+ ימי לחימה מאז 7.10.23 מקנים קבוצה C; שכול או פגיעת-פעולה — קבוצה G; שירות קבע בתוכנית שירות — האפשרות הייעודית למטה. אם זה המצב שלכם, בחרו כאן." />
              : <Bidi text="300+ combat days since Oct 7 2023 → Group C · bereaved or wounded → Group G · career service → the dedicated option below. If that's you, pick it here." />}
          </p>
          <Select
            value={manualGroup}
            onValueChange={(g) => {
              setManualGroup(g);
              if (g === "CAREER_SERVICE") {
                // Career service in a service-track program → Group C, WITH the
                // marker so the label reads "משרת/ת קבע", not "35+ reserve days".
                updateProfileMutation.mutate({ miluimGroup: "GROUP_C", miluimCareerService: true });
              } else {
                updateProfileMutation.mutate({
                  miluimGroup: g as "NONE" | "GROUP_A" | "GROUP_B" | "GROUP_C" | "GROUP_G",
                  // A plain group pick is not career service — clear the flag.
                  miluimCareerService: false,
                });
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-72" aria-labelledby="miluim-manual-group-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MILUIM_CONFIG.GROUPS) as Array<keyof typeof MILUIM_CONFIG.GROUPS>).map((g) => (
                <SelectItem key={g} value={g}>
                  {isHe ? MILUIM_CONFIG.GROUPS[g].nameHe : MILUIM_CONFIG.GROUPS[g].nameEn}
                </SelectItem>
              ))}
              <SelectItem value="CAREER_SERVICE">
                {isHe ? "שירות קבע (בתוכנית שירות) — קבוצה C" : "Career service (service-track) — Group C"}
              </SelectItem>
            </SelectContent>
          </Select>
          {/* Make the day-row precedence visible: if the student set a manual
              group AND entered days that derive a different group, the day-row
              wins for THIS semester — say so instead of silently overriding. */}
          {manualGroup !== "NONE" &&
            (days ?? 0) > 0 &&
            deriveGroupFromDays(days ?? 0, combat) !== manualGroup && (
              <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-600">
                {isHe
                  ? "שימו לב: הזנתם ימים לסמסטר הנוכחי — הם קובעים את הקבוצה לסמסטר הזה וגוברים על הסיווג הידני. הסיווג הידני חל על סמסטרים בלי ימים."
                  : "Note: you entered days for the current semester — those set the group for this semester and override the manual classification. The manual classification applies to semesters with no days entered."}
              </p>
            )}
        </div>

        {/* Cumulative quota — STUDENT-EDITABLE so the degree cap + warnings
            actually engage (fix B). The army doesn't feed these, so the student
            records what they've already used across earlier semesters. */}
        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium text-foreground/70">
            {t("cumulativeTitle")}
          </p>
          {/* M1 (note 46): the SAME QuotaCard steppers the miluim strip's
              benefits panel uses — a step writes immediately through the same
              updateProfile mutation, so every surface updates at once. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuotaCard
              icon={Shield}
              label={t("creditExemptionUsed")}
              used={creditsUsed ?? 0}
              cap={creditCap}
              hint={t("creditExemptionUsedHint")}
              pending={updateProfileMutation.isPending}
              isHe={isHe}
              onChange={(next) => {
                setCreditsUsed(next);
                updateProfileMutation.mutate({ miluimCreditsUsed: Math.min(creditCap, Math.max(0, next)) });
              }}
            />
            <QuotaCard
              icon={Swords}
              label={t("binaryUsed")}
              used={binaryUsedInput ?? 0}
              cap={binaryCap}
              hint={t("binaryUsedHint")}
              pending={updateProfileMutation.isPending}
              isHe={isHe}
              onChange={(next) => {
                setBinaryUsedInput(next);
                updateProfileMutation.mutate({ miluimBinaryUsed: Math.min(binaryCap, Math.max(0, next)) });
              }}
            />
          </div>
        </div>

        {/* #27 — the binary/rights playbook, sourced from the domain rules
            (docs/pakam-domain-rules-2026.md) + the national תשפ״ו outline.
            Everything here is policy that changes yearly — hence the tag. */}
        <details className="rounded-lg border border-border/50 bg-foreground/[0.02] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground/75">
            {isHe ? "איך מנצלים את הזכויות חכם? המדריך הקצר" : "How to use the benefits wisely — the short playbook"}{" "}
            <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-normal text-foreground/50">
              {isHe ? "נכון לתשפ״ו" : "As of 2025-26"}
            </span>
          </summary>
          {isHe ? (
            <div className="mt-3 space-y-3 text-xs leading-relaxed text-foreground/65">
              <div>
                <p className="font-semibold text-foreground/75">רגע, מה זה הקבוצות?</p>
                <p className="mt-1">
                  האוניברסיטה מסווגת כל מי ששירת במילואים לקבוצה, לפי כמה ימים שירתם באותו סמסטר.
                  ככל שהקבוצה &quot;גבוהה&quot; יותר — ההטבות גדולות יותר:
                </p>
                <ul className="mt-1.5 space-y-1">
                  <li>• <b>קבוצה A</b> — עד 20 ימי מילואים בסמסטר.</li>
                  {/* A Latin letter followed by a number with only neutrals
                      between them reorders in RTL ("קבוצה B — 21" reads
                      "קבוצה 21 — B", measured). A Hebrew word between the two
                      keeps them in reading order. */}
                  <li>• <b>קבוצה B</b> — שירות של 21 עד 34 ימים (לוחמים: כבר מ-14 ימים).</li>
                  <li>• <b>קבוצה C</b> — שירות של 35 ימים ומעלה (לוחמים: כבר מ-21).</li>
                  <li>• <b>קבוצה G</b> — נפגעי מלחמה, פצועים ומשפחות שכולות — מטופלים אישית בדיקנט.</li>
                </ul>
                <p className="mt-1.5">
                  הקבוצה נקבעת מחדש בכל סמסטר לפי הימים של אותו סמסטר (הצבא מדווח לאוניברסיטה
                  אוטומטית). מה שכן נשאר איתכם לאורך כל התואר: הפטורים שצברתם (עד 10 ש״ס)
                  וההמרות הבינאריות שניצלתם (עד 5).
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground/75">בינארי — למי וכמה?</p>
                <p className="mt-1">
                  קבוצה B יכולה להמיר עד 2 קורסים בשנה לציון &quot;עובר&quot;, וקבוצה C עד 3 (לשתיהן —
                  מקסימום 5 בכל התואר). את ההמרה עצמה מבצעים מול מזכירות החוג; כאן רק מתכננים אותה חכם:
                  שווה להמיר קורס כבד שהציון הצפוי בו נמוך מהממוצע שלכם — ההמרה מוציאה אותו מהממוצע.
                  לא כדאי (ולפעמים אסור) להמיר קורסים שדורשים ציון מספרי למעבר-שנה (רף 75/80), סמינרים,
                  או קורסים שחשובים לקבלה לתואר שני.
                </p>
                <p className="mt-1">
                  <b>ועוד אזהרה חשובה:</b> מי שממיר יותר מ-25% משעות-השנה מאבד זכאות להצטיינות
                  דקאן/רקטור. בדיקת-המסלול תתריע לפני שמתקרבים לזה.
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground/75">מבחנים והערכה חלופית</p>
                <p className="mt-1">
                  קבוצות B ו-C ניגשות ל-2 מתוך 3 מועדי בחינה — והציון הגבוה מביניהם נשמר אוטומטית.
                  בנוסף, לפי המתווה הארצי לתשפ״ו אפשר לקבל בחלק מהקורסים הערכה חלופית במקום בחינה —
                  היישום המדויק משתנה מקורס לקורס, אז מוודאים מול מדור-מילואים.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-foreground/65">
              The group is re-assigned each semester; exemptions and binary conversions accumulate (caps: 10 credits, 5 binary). Convert heavy low-grade courses — never gate courses (the 75/80 numeric bar), seminars, or grad-school-critical ones. Converting more than 25% of a year&apos;s hours forfeits honors. Groups B/C/G sit 2-of-3 exam dates, higher counts. Alternative assessment per the national 2025-26 outline — confirm specifics with the miluim desk.
            </p>
          )}
        </details>
      </div>
    </SectionCard>
  );
}
