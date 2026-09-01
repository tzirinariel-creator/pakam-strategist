"use client";

import { useTranslations, useLocale } from "next-intl";
import { Bidi } from "@/lib/bidi";
import {
  GraduationCap,
  Target,
  BookOpen,
  FileText,
  Languages,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import {
  CREDIT_REQUIREMENTS,
  SEMINAR_REQUIREMENTS,
  GRADE_REQUIREMENTS,
  GRADE_WEIGHTS,
  DISCIPLINE_CONFIG,
} from "@/lib/constants";
import { getProgramById } from "@/lib/programs/registry";

// ─── Discipline breakdown data (derived from ProgramDefinition) ─────

const DISCIPLINE_ROWS = getProgramById(null)
  .disciplines.filter((d) => d.id !== "GENERAL" && d.minCredits > 0)
  .map((d) => ({ key: d.id, credits: d.minCredits }));

// ─── Section wrapper ────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-foreground/50" />
        <h3 className="text-sm font-bold text-foreground/80">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────
// Locale-aware (#audit-r1): every label now flows through the `degreeInfo`
// namespace (present in both he.json and en.json) instead of hardcoded Hebrew,
// so an English-locale student sees an English card.

export function DegreeInfoCard() {
  const t = useTranslations("degreeInfo");
  const isHe = useLocale() === "he";

  const glossary: readonly [string, string][] = [
    [t("glossary.shasTerm"), t("glossary.shasDef")],
    [t("glossary.seminarTerm"), t("glossary.seminarDef")],
    [t("glossary.referatTerm"), t("glossary.referatDef")],
    [t("glossary.focusTerm"), t("glossary.focusDef")],
    [t("glossary.levelTerm"), t("glossary.levelDef")],
    [t("glossary.exemptTerm"), t("glossary.exemptDef")],
  ];

  return (
    <div className="max-h-[60vh] overflow-y-auto space-y-3 pe-1" tabIndex={0} role="region" aria-label={t("overviewRichTitle")}>
      {/* ── Section 1: Overview ──────────────────────────────────── */}
      <Section icon={GraduationCap} title={t("overviewRichTitle")}>
        {/* Total credits callout */}
        <div className="mb-3 rounded-md border border-border/30 bg-foreground/[0.03] px-3 py-2 text-center">
          <div className="flex flex-wrap items-baseline justify-center gap-x-1.5">
            <span className="font-mono text-2xl font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.TOTAL}
            </span>
            <span className="text-sm text-foreground/50">{t("totalCredits")}</span>
          </div>
          <p className="mt-0.5 text-xs text-foreground/40">
            <Bidi text={t("creditsAboveRegular")} />
          </p>
        </div>

        {/* 3 mini cards */}
        <div className="grid grid-cols-3 gap-2">
          {/* Mandatory — the OFFICIAL figure, so the three cards sum to the
              headline. #49: "זה לא מגיע ל-150 אפילו." They summed to 148,
              because this printed the internal gate (101) instead of what the
              ידיעון publishes (103). The two missing credits are explained
              under the row rather than silently dropped. */}
          <div className="flex flex-col items-center gap-1 rounded-md border border-border/30 bg-card/30 px-2 py-2.5">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL}
            </span>
            <span className="text-[10px] font-medium text-foreground/50">
              {t("mandatory")}
            </span>
          </div>
          {/* Electives */}
          <div className="flex flex-col items-center gap-1 rounded-md border border-border/30 bg-card/30 px-2 py-2.5">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.ELECTIVE_TOTAL}
            </span>
            <span className="text-[10px] font-medium text-foreground/50">
              {t("elective")}
            </span>
          </div>
          {/* Seminars */}
          <div className="flex flex-col items-center gap-1 rounded-md border border-border/30 bg-card/30 px-2 py-2.5">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.SEMINAR_TOTAL}
            </span>
            <span className="text-[10px] font-medium text-foreground/50">
              {t("seminarsLabel")}
            </span>
          </div>
        </div>
        {CREDIT_REQUIREMENTS.MANDATORY_UNPUBLISHED > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-foreground/40">
            {isHe
              ? `מתוך ${CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL} ש״ס החובה, ${CREDIT_REQUIREMENTS.MANDATORY_UNPUBLISHED} עדיין בלי קורס בידיעון — לכן פכמון בודק אתכם מול ${CREDIT_REQUIREMENTS.MANDATORY_TOTAL} ולא ידרוש מכם ש״ס שאין ממה לקחת.`
              : `Of the ${CREDIT_REQUIREMENTS.MANDATORY_OFFICIAL} mandatory credits, ${CREDIT_REQUIREMENTS.MANDATORY_UNPUBLISHED} have no catalog course yet — so Pakamon checks you against ${CREDIT_REQUIREMENTS.MANDATORY_TOTAL} rather than asking for credits nothing can supply.`}
          </p>
        )}
      </Section>

      {/* ── Section 2: Discipline Breakdown ──────────────────────── */}
      <Section icon={BarChart3} title={t("disciplineBreakdownTitle")}>
        <div className="space-y-2">
          {DISCIPLINE_ROWS.map(({ key, credits }) => {
            const config = DISCIPLINE_CONFIG[key];
            if (!config) return null;
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-md border border-border/30 bg-card/30 px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-sm text-foreground/70">
                    {isHe ? config.nameHe : config.nameEn}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-foreground/80">
                  {credits} {t("creditsSuffix")}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Section 3: Focus Area ────────────────────────────────── */}
      <Section icon={Target} title={t("focusAreaTitle")}>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.FOCUS_AREA_MIN}
            </span>
            <span className="text-sm text-foreground/60">
              {t("minCreditsInOneDiscipline")}
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-foreground/[0.03] px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
            <p className="text-xs leading-relaxed text-foreground/50">
              {t("focusAreaExplanation")}
            </p>
          </div>
        </div>
      </Section>

      {/* ── Section 4: Seminars ───────────────────────────────────── */}
      <Section icon={BookOpen} title={t("seminarsTitle")}>
        <div className="space-y-2.5">
          {/* Main requirement */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="text-sm text-foreground/70">
              <span className="font-mono font-bold text-foreground/80">
                {SEMINAR_REQUIREMENTS.TOTAL}
              </span>
              {" "}
              {t("seminarsRequired")}{" "}
              <span className="font-mono text-foreground/80">{SEMINAR_REQUIREMENTS.PAPERS}</span>
              {" "}{t("seminarPapers")} +{" "}
              <span className="font-mono text-foreground/80">{SEMINAR_REQUIREMENTS.REFERATS}</span>
              {" "}{t("referat")} ={" "}
              <span className="font-mono text-foreground/80">{CREDIT_REQUIREMENTS.SEMINAR_TOTAL}</span>
              {" "}{t("creditsSuffix")}
            </p>
          </div>

          {/* Grade weight note */}
          <div className="flex items-start gap-2 text-xs text-foreground/50">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
            <span>{t("eachPaperWeight")}</span>
          </div>

          {/* Restrictions */}
          <div className="flex items-start gap-2 rounded-md bg-foreground/[0.03] px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
            <p className="text-xs leading-relaxed text-foreground/50">
              {t("maxEconSeminars", { maxEcon: SEMINAR_REQUIREMENTS.MAX_DISCIPLINE_SEMINARS })}
            </p>
          </div>
        </div>
      </Section>

      {/* ── Section 5: English & Grade Requirements ───────────────── */}
      <Section icon={Languages} title={t("englishAndGradesTitle")}>
        <div className="space-y-2.5">
          {/* English courses */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="text-sm text-foreground/70">
              <span className="font-mono font-bold text-foreground/80">
                {CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES}
              </span>
              {" "}
              {t("coursesInEnglish", { min: CREDIT_REQUIREMENTS.ENGLISH_MIN_CREDITS_PER_COURSE })}
            </p>
            {/* #10: intro-phil can be taken in English, which also satisfies the
                English-content requirement. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
              {t("englishTip")}
            </p>
          </div>

          {/* Year transition requirements */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="mb-1 text-xs font-bold text-foreground/60">
              {t("yearTransitionTitle")}
            </p>
            <p className="text-sm text-foreground/70">
              {t("overallGPA")}{" "}
              <bdi dir="ltr" className="font-mono font-bold text-foreground/80">
                {GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA}
              </bdi>{" "}
              {t("orHigher")} + {t("ppeGPA")}{" "}
              <bdi dir="ltr" className="font-mono font-bold text-foreground/80">
                {GRADE_REQUIREMENTS.YEAR_TRANSITION_PPE_GPA}
              </bdi>{" "}
              {t("orHigher")}
            </p>
          </div>

          {/* Grade weight breakdown */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="mb-1.5 text-xs font-bold text-foreground/60">
              {t("gradeCompositionTitle")}
            </p>
            <div className="flex items-center gap-3 text-sm text-foreground/70">
              <span>
                <span className="font-mono font-bold text-foreground/80">
                  {Math.round(GRADE_WEIGHTS.COURSES * 100)}%
                </span>
                {" "}{t("courses")}
              </span>
              <span className="text-foreground/20">|</span>
              <span>
                <span className="font-mono font-bold text-foreground/80">
                  {Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}%
                </span>
                {" "}{t("papers")}
              </span>
              <span className="text-foreground/20">|</span>
              <span>
                <span className="font-mono font-bold text-foreground/80">
                  {Math.round(GRADE_WEIGHTS.REFERAT * 100)}%
                </span>
                {" "}{t("referat")}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section: Glossary — plain-language term explanations (#4). ── */}
      <Section icon={BookOpen} title={t("glossaryTitle")}>
        <dl className="space-y-2 text-xs">
          {glossary.map(([term, def]) => (
            <div key={term} className="rounded-md border border-border/20 bg-card/20 px-3 py-2">
              <dt className="font-bold text-foreground/75">{term}</dt>
              <dd className="mt-0.5 text-foreground/55">
                <Bidi text={def} />
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
