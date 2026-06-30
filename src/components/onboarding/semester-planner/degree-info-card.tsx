"use client";

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

export function DegreeInfoCard() {

  return (
    <div className="max-h-[60vh] overflow-y-auto space-y-3 pe-1">
      {/* ── Section 1: Overview ──────────────────────────────────── */}
      <Section icon={GraduationCap} title="מה שצריך לדעת על פכ״מ">
        {/* Total credits callout */}
        <div className="mb-3 rounded-md border border-border/30 bg-foreground/[0.03] px-3 py-2 text-center">
          <div className="flex flex-wrap items-baseline justify-center gap-x-1.5">
            <span className="font-mono text-2xl font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.TOTAL}
            </span>
            <span className="text-sm text-foreground/50">ש״ס סה״כ לתואר</span>
          </div>
          <p className="mt-0.5 text-xs text-foreground/40">
            <Bidi text="30 ש״ס מעל תואר ראשון רגיל (120)" />
          </p>
        </div>

        {/* 3 mini cards */}
        <div className="grid grid-cols-3 gap-2">
          {/* Mandatory */}
          <div className="flex flex-col items-center gap-1 rounded-md border border-border/30 bg-card/30 px-2 py-2.5">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.MANDATORY_TOTAL}
            </span>
            <span className="text-[10px] font-medium text-foreground/50">
              {/* Mandatory */}
              חובה
            </span>
          </div>
          {/* Electives */}
          <div className="flex flex-col items-center gap-1 rounded-md border border-border/30 bg-card/30 px-2 py-2.5">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.ELECTIVE_TOTAL}
            </span>
            <span className="text-[10px] font-medium text-foreground/50">
              {/* Electives */}
              בחירה
            </span>
          </div>
          {/* Seminars */}
          <div className="flex flex-col items-center gap-1 rounded-md border border-border/30 bg-card/30 px-2 py-2.5">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.SEMINAR_TOTAL}
            </span>
            <span className="text-[10px] font-medium text-foreground/50">
              {/* Seminars */}
              סמינרים
            </span>
          </div>
        </div>
      </Section>

      {/* ── Section 2: Discipline Breakdown ──────────────────────── */}
      <Section icon={BarChart3} title="חלוקה לפי תחום">
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
                    {config.nameHe}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-foreground/80">
                  {credits} ש״ס
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Section 3: Focus Area ────────────────────────────────── */}
      <Section icon={Target} title="התמחות (תחום מיקוד)">
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground/80">
              {CREDIT_REQUIREMENTS.FOCUS_AREA_MIN}
            </span>
            <span className="text-sm text-foreground/60">
              {/* Minimum credits in ONE discipline */}
              ש״ס לפחות בתחום אחד
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-foreground/[0.03] px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
            <p className="text-xs leading-relaxed text-foreground/50">
              {/* The focus area determines your civil service classification (shinuy).
                  You must accumulate at least 60 credits in a single discipline
                  to be classified under that field. */}
              תחום המיקוד קובע את סיווג המשרה בשירות המדינה (שינוי).
              יש לצבור לפחות 60 ש״ס בתחום אחד כדי להיות מסווג בתחום זה.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Section 4: Seminars ───────────────────────────────────── */}
      <Section icon={BookOpen} title="סמינריונים">
        <div className="space-y-2.5">
          {/* Main requirement */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="text-sm text-foreground/70">
              <span className="font-mono font-bold text-foreground/80">
                {SEMINAR_REQUIREMENTS.TOTAL}
              </span>
              {" "}
              {/* seminars required: 3 full papers + 1 referat = 12 credits */}
              סמינרים נדרשים:{" "}
              <span className="font-mono text-foreground/80">{SEMINAR_REQUIREMENTS.PAPERS}</span>
              {" "}עבודות סמינריוניות +{" "}
              <span className="font-mono text-foreground/80">{SEMINAR_REQUIREMENTS.REFERATS}</span>
              {" "}רפרט = 12 ש״ס
            </p>
          </div>

          {/* Grade weight note */}
          <div className="flex items-start gap-2 text-xs text-foreground/50">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
            <span>
              {/* Each paper = ~6% of entire degree grade */}
              כל עבודה סמינריונית = כ-6% מהציון הסופי לתואר
            </span>
          </div>

          {/* Restrictions */}
          <div className="flex items-start gap-2 rounded-md bg-foreground/[0.03] px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
            <p className="text-xs leading-relaxed text-foreground/50">
              {/* Max N seminars per discipline rule, max 2 with the same professor */}
              {SEMINAR_REQUIREMENTS.DISCIPLINE_RULE_ID && (
                <>
                  מקסימום {SEMINAR_REQUIREMENTS.MAX_DISCIPLINE_SEMINARS} סמינרים ב{getProgramById(null).disciplines.find(d => d.id === SEMINAR_REQUIREMENTS.DISCIPLINE_RULE_ID)?.nameHe ?? SEMINAR_REQUIREMENTS.DISCIPLINE_RULE_ID},{" "}
                </>
              )}
              מקסימום 2 סמינרים אצל אותו מרצה
            </p>
          </div>
        </div>
      </Section>

      {/* ── Section 5: English & Grade Requirements ───────────────── */}
      <Section icon={Languages} title="אנגלית ודרישות ציון">
        <div className="space-y-2.5">
          {/* English courses */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="text-sm text-foreground/70">
              <span className="font-mono font-bold text-foreground/80">
                {CREDIT_REQUIREMENTS.ENGLISH_MIN_COURSES}
              </span>
              {" "}
              {/* courses taught IN English (any discipline, min 2 credits each) */}
              קורסים הנלמדים באנגלית (כל תחום, מינימום{" "}
              {CREDIT_REQUIREMENTS.ENGLISH_MIN_CREDITS_PER_COURSE} ש״ס כ״א)
            </p>
            {/* #10: intro-phil (e.g. מבוא לפילוסופיה של המוסר) can be taken in
                English, which also satisfies the English-content requirement —
                so it's more flexible than a fixed sem-A mandatory. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
              טיפ: חלק מקורסי-החובה (כמו &quot;מבוא לפילוסופיה של המוסר&quot;) ניתן
              ללמוד גם באנגלית — וכך הם נספרים גם לדרישת-האנגלית.
            </p>
          </div>

          {/* Year transition requirements */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="mb-1 text-xs font-bold text-foreground/60">
              {/* Year transition requirement */}
              דרישות מעבר שנה
            </p>
            <p className="text-sm text-foreground/70">
              {/* "75 ומעלה" reads naturally in Hebrew — the bare ≥ glyph looked
                  broken (#3). The number stays in an isolated LTR bdi. */}
              ממוצע כללי{" "}
              <bdi dir="ltr" className="font-mono font-bold text-foreground/80">
                {GRADE_REQUIREMENTS.YEAR_TRANSITION_OVERALL_GPA}
              </bdi>{" "}
              ומעלה + ממוצע קורסי פכ״מ{" "}
              <bdi dir="ltr" className="font-mono font-bold text-foreground/80">
                {GRADE_REQUIREMENTS.YEAR_TRANSITION_PPE_GPA}
              </bdi>{" "}
              ומעלה
            </p>
          </div>

          {/* Grade weight breakdown */}
          <div className="rounded-md border border-border/30 bg-card/30 px-3 py-2">
            <p className="mb-1.5 text-xs font-bold text-foreground/60">
              {/* Degree grade composition */}
              הרכב ציון התואר
            </p>
            <div className="flex items-center gap-3 text-sm text-foreground/70">
              <span>
                <span className="font-mono font-bold text-foreground/80">
                  {Math.round(GRADE_WEIGHTS.COURSES * 100)}%
                </span>
                {" "}קורסים
              </span>
              <span className="text-foreground/20">|</span>
              <span>
                <span className="font-mono font-bold text-foreground/80">
                  {Math.round(GRADE_WEIGHTS.SEMINAR_PAPERS * 100)}%
                </span>
                {" "}עבודות
              </span>
              <span className="text-foreground/20">|</span>
              <span>
                <span className="font-mono font-bold text-foreground/80">
                  {Math.round(GRADE_WEIGHTS.REFERAT * 100)}%
                </span>
                {" "}רפרט
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section: Glossary — plain-language explanations of the terms
          students kept finding unclear (#4). Always visible, RTL-safe. ── */}
      <Section icon={BookOpen} title="מילון מונחים">
        <dl className="space-y-2 text-xs">
          {([
            ["ש״ס", "שעות סמסטריאליות — נקודות הזכות שצוברים לתואר."],
            ["סמינר / סמינריון", "קורס מתקדם שבו כותבים עבודת מחקר. צריך 4 כאלה לתואר."],
            ["רפרט", "עבודה סמינריונית מצומצמת — נספרת 4% מציון התואר."],
            ["תחום מיקוד", "הדיסציפלינה שבה מתמחים (60 ש״ס) — קובעת את הסיווג בשירות המדינה."],
            ["קורסי רמה (אנגלית)", "קורסי אנגלית מכינים שלא נספרים ל-150, לפי ציון אמירנט."],
            ["פטור (אנגלית)", "אין צורך בקורסי-רמה. עדיין צריך 2 קורסי-תוכן באנגלית."],
          ] as const).map(([term, def]) => (
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
