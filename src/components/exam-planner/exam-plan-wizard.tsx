"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  CalendarOff,
  Plus,
  Coffee,
  Gauge,
  Sparkles,
  CalendarRange,
  CheckCircle2,
} from "lucide-react";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// ExamPlanWizard — a 4-step question flow that refines the study plan.
//
// It is a THIN WRAPPER around the existing exam-planner screen: step 1 is the
// caller's own exam-picking panel (passed as a prop, NOT rewritten); steps 2–4
// collect prep-style + blocked days and show a live preview. Honesty-first:
// nothing here predicts a date or a difficulty — blocked days only tell the
// engine where NOT to schedule study, and prep-style only reshapes the spread.
// State (prepStyle, blockedDays) is owned by the parent and passed down, so the
// same wizard can be reopened in "re-tune" mode with saved answers.
// ─────────────────────────────────────────────────────────────────────

export type PrepStyle = "steady" | "crammer" | "light";

const PREP_OPTIONS: {
  value: PrepStyle;
  icon: React.ComponentType<{ className?: string }>;
  he: string;
  en: string;
  subHe: string;
  subEn: string;
}[] = [
  {
    value: "steady",
    icon: Gauge,
    he: "קצת כל יום",
    en: "A bit every day",
    subHe: "פיזור מלא על כל החלון — מומלץ",
    subEn: "Spread evenly across the whole window — recommended",
  },
  {
    value: "crammer",
    icon: Sparkles,
    he: "בעיקר בימים שלפני",
    en: "Mostly the days before",
    subHe: "מרוכז יותר סמוך למבחן",
    subEn: "Denser closer to the exam",
  },
  {
    value: "light",
    icon: Coffee,
    he: "כבר התחלתי, רק לחזור",
    en: "Already started, just review",
    subHe: "פחות שעות — רק ריענון",
    subEn: "Fewer hours — a refresh only",
  },
];

interface ExamPlanWizardProps {
  isHe: boolean;
  /** The existing exam-picking panel (re-used verbatim as step 1). */
  pickPanel: React.ReactNode;
  /** Live-preview skyline for step 4 (built by the parent from the tuned inputs). */
  previewSkyline: React.ReactNode;
  /** Recommendations card for step 4. */
  recsCard: React.ReactNode;
  /** How many exams are currently selected — gates "next" on step 1. */
  selectedCount: number;
  prepStyle: PrepStyle;
  onPrepStyle: (s: PrepStyle) => void;
  blockedDays: string[]; // "YYYY-MM-DD"
  onBlockedDays: (days: string[]) => void;
  /** Fires the real generate/update on finish. */
  onFinish: () => void;
  finishBusy: boolean;
  /** Label for the finish button (build vs update). */
  finishLabel: string;
}

const STEP_TITLES_HE = ["אילו מבחנים", "סגנון ההכנה", "ימים חסומים", "סקירה ובנייה"];
const STEP_TITLES_EN = ["Which exams", "Prep style", "Blocked days", "Review & build"];

function fmtDayChip(key: string, isHe: boolean): string {
  const [yy, mm, dd] = key.split("-").map(Number);
  if (!yy || !mm || !dd) return key;
  const d = new Date(yy, mm - 1, dd);
  return d.toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short" });
}

export function ExamPlanWizard({
  isHe,
  pickPanel,
  previewSkyline,
  recsCard,
  selectedCount,
  prepStyle,
  onPrepStyle,
  blockedDays,
  onBlockedDays,
  onFinish,
  finishBusy,
  finishLabel,
}: ExamPlanWizardProps) {
  const [step, setStep] = useState(1); // 1..4
  const [dayInput, setDayInput] = useState("");

  const titles = isHe ? STEP_TITLES_HE : STEP_TITLES_EN;
  const canNext = step === 1 ? selectedCount > 0 : true;

  const sortedDays = useMemo(() => blockedDays.slice().sort(), [blockedDays]);

  const addDay = () => {
    if (!dayInput) return;
    if (!blockedDays.includes(dayInput)) onBlockedDays([...blockedDays, dayInput]);
    setDayInput("");
  };
  const removeDay = (k: string) => onBlockedDays(blockedDays.filter((d) => d !== k));

  const Prev = isHe ? ChevronRight : ChevronLeft;
  const Next = isHe ? ChevronLeft : ChevronRight;

  return (
    <div className="data-card overflow-hidden p-0">
      {/* Progress dots */}
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 rounded-full transition-all",
                n === step ? "w-6 bg-accent-brand" : n < step ? "w-1.5 bg-accent-brand/50" : "w-1.5 bg-foreground/15",
              )}
            />
          ))}
        </div>
        <span className="ms-auto text-xs font-medium text-foreground/55">
          <Bidi text={`${step}/4`} /> · {titles[step - 1]}
        </span>
      </div>

      {/* Step body */}
      <div className="p-4">
        {step === 1 && <div>{pickPanel}</div>}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-foreground/85">{isHe ? "איך אתם מעדיפים ללמוד?" : "How do you prefer to study?"}</h3>
              <p className="mt-0.5 text-xs text-foreground/50">
                {isHe ? "נכוונן את פיזור הלמידה בהתאם — תמיד אפשר לשנות אחר כך." : "We'll shape the spread accordingly — you can change it later."}
              </p>
            </div>
            <div className="space-y-2">
              {PREP_OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = prepStyle === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onPrepStyle(o.value)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors",
                      active ? "border-accent-brand bg-accent-brand/[0.05]" : "border-border/60 hover:bg-foreground/[0.03]",
                    )}
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent-brand text-accent-brand-fg" : "bg-foreground/[0.06] text-foreground/50")}>
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground/85">{isHe ? o.he : o.en}</span>
                      <span className="block text-xs text-foreground/50">{isHe ? o.subHe : o.subEn}</span>
                    </span>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", active ? "border-accent-brand bg-accent-brand text-accent-brand-fg" : "border-foreground/25")}>
                      {active && <CheckCircle2 className="size-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground/85">
                <CalendarOff className="size-4 text-accent-brand" />
                {isHe ? "יש ימים שאי-אפשר ללמוד?" : "Any days you can't study?"}
              </h3>
              <p className="mt-0.5 text-xs text-foreground/50">
                {isHe ? "עבודה, מילואים, אירוע — נדלג עליהם בשיבוץ." : "Work, reserve duty, an event — we'll skip them when scheduling."}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="date"
                value={dayInput}
                onChange={(e) => setDayInput(e.target.value)}
                className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground/80 focus:border-foreground/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={addDay}
                disabled={!dayInput}
                className="inline-flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/15 disabled:opacity-40"
              >
                <Plus className="size-4" />
                {isHe ? "הוסיפו" : "Add"}
              </button>
            </div>
            {sortedDays.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sortedDays.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-1 text-xs text-foreground/70">
                    <Bidi text={fmtDayChip(k, isHe)} />
                    <button type="button" onClick={() => removeDay(k)} aria-label={isHe ? "הסירו" : "remove"} className="text-foreground/40 transition-colors hover:text-red-400">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="rounded-lg bg-accent-brand/[0.06] px-3 py-2 text-xs leading-relaxed text-foreground/60">
              {isHe
                ? "לא נחסום לכם שום מוֹעד — רק נמנע מלשבץ לימוד ביום הזה."
                : "We won't block any exam sitting — we only avoid scheduling study on that day."}
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground/85">{isHe ? "הנה התוכנית" : "Here's the plan"}</h3>
              <p className="mt-0.5 text-xs text-foreground/50">
                {isHe ? "תצוגה מקדימה חיה. אפשר לחזור ולכוונן, או לבנות." : "A live preview. Go back to tune, or build it."}
              </p>
            </div>
            {previewSkyline}
            {recsCard}
          </div>
        )}
      </div>

      {/* Sticky nav */}
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-border/50 bg-card/95 px-4 py-3 backdrop-blur">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
          >
            <Prev className="size-4" />
            {isHe ? "חזרה" : "Back"}
          </button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(4, s + 1))}
            disabled={!canNext}
            className="ms-auto inline-flex items-center gap-1 rounded-lg bg-accent-brand px-4 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
          >
            {isHe ? "הבא" : "Next"}
            <Next className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onFinish}
            disabled={finishBusy || selectedCount === 0}
            className="ms-auto inline-flex items-center gap-2 rounded-lg bg-accent-brand px-4 py-2 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
          >
            <CalendarRange className="size-4" />
            {finishLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MoedPrinciplesCard — transparent guidance on how to think about Moed A vs B
// (#32). Honesty-first: NO date/difficulty prediction, NO "take it, it's easy".
// Just the real, publishable principles: the last grade counts, the gap between
// sittings, and load.
// ─────────────────────────────────────────────────────────────────────

export function MoedPrinciplesCard({ isHe }: { isHe: boolean }) {
  const points = isHe
    ? [
        { t: "הציון האחרון קובע", d: "אם ניגשים למועד ב׳ — הוא שמחליף את א׳, גם אם נמוך יותר. לכן מועד א׳ הוא ברירת-המחדל, ו-ב׳ נשמר כרשת-ביטחון." },
        { t: "מרווח בין המועדים", d: "ככל שהמרווח בין א׳ ל-ב׳ גדול יותר — יש יותר זמן לתקן. מרווח קצר מדי אומר פחות זמן ללמוד מחדש." },
        { t: "עומס באותה תקופה", d: "אם כמה מבחנים צפופים על אותם ימים, פיזור אחד מהם למועד ב׳ יכול להקל — לא כי הוא 'קל', אלא כדי לפרוס את העומס." },
      ]
    : [
        { t: "The last grade counts", d: "If you sit Moed B, it replaces Moed A — even if it's lower. That's why Moed A is the default and B stays as a safety net." },
        { t: "The gap between sittings", d: "A wider gap between A and B means more time to recover. Too short a gap means less time to re-study." },
        { t: "Load in the same window", d: "If several exams crowd the same days, moving one to Moed B can ease the load — not because it's 'easy', but to spread the pressure." },
      ];

  return (
    <div className="data-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarRange className="size-4 text-accent-brand" />
        <h3 className="text-sm font-bold text-foreground/85">{isHe ? "מועד א׳ או ב׳ — איך חושבים על זה" : "Moed A or B — how to think about it"}</h3>
      </div>
      <ul className="space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/10 text-[11px] font-bold text-accent-brand">
              <Bidi text={String(i + 1)} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-foreground/80">{p.t}</span>
              <span className="block text-xs leading-relaxed text-foreground/60">{p.d}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-border/40 pt-2.5 text-[11px] leading-relaxed text-foreground/45">
        {isHe
          ? "לא ננחש תאריכים שלא פורסמו ולא נחזה כמה מבחן יהיה קשה — ההחלטה שלכם, על בסיס העקרונות והעבר האמיתי."
          : "We won't guess unpublished dates or predict how hard an exam will be — the call is yours, based on these principles and your real history."}
      </p>
    </div>
  );
}
