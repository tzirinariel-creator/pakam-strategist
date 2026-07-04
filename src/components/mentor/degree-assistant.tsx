"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Send, ArrowLeft, ArrowRight } from "lucide-react";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { Link } from "@/i18n/navigation";
import { greetNameForLocale, gendered, normalizeGender } from "@/lib/personal-address";
import { DISCIPLINE_CONFIG } from "@/lib/constants";
import {
  deriveCurrentGroup,
  binaryCapRemaining,
  getCurrentAcademicYear,
  type MiluimGroupKey,
} from "@/lib/miluim";
import {
  answerDegreeQuestion,
  suggestedQuestions,
  type QAContext,
  type QAAnswer,
} from "@/lib/degree-qa";
import { CREDIT_REQUIREMENTS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";

interface Turn {
  q: string;
  a: QAAnswer;
}

/**
 * Degree Assistant — a free, deterministic "ask me about your degree" chat. No
 * API key, no LLM, no cost: it answers from the student's own data + the domain
 * knowledge encoded in the app (see lib/degree-qa.ts).
 */
export function DegreeAssistant() {
  const locale = useLocale();
  const isHe = locale === "he";
  const Arrow = isHe ? ArrowLeft : ArrowRight;

  const creditsQuery = api.plan.getCredits.useQuery(undefined, { retry: 1 });
  const gradeQuery = api.plan.getGraduationScore.useQuery(undefined, { retry: 1 });
  const regulationQuery = api.regulation.checkCompliance.useQuery(undefined, { retry: 1 });
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: 1 });
  const semestersQuery = api.user.listMiluimSemesters.useQuery(undefined, { retry: 1 });
  const planQuery = api.plan.getUserPlan.useQuery(undefined, { retry: 1 });

  const ctx: QAContext = useMemo(() => {
    const b = creditsQuery.data?.breakdown ?? null;
    const profile = profileQuery.data;
    const focusArea = profile?.focusArea ?? null;
    const focusCfg = focusArea ? DISCIPLINE_CONFIG[focusArea] : null;

    const group = deriveCurrentGroup(
      semestersQuery.data ?? [],
      (profile?.miluimGroup ?? "NONE") as MiluimGroupKey,
      { academicYear: getCurrentAcademicYear(), semester: profile?.currentSemester ?? null }
    );
    // Locale-aware so the English assistant says "Group C", not "קבוצה C"
    // embedded mid-sentence in English (#37).
    const groupName =
      group === "NONE"
        ? null
        : `${isHe ? "קבוצה" : "Group"} ${group.replace("GROUP_", "")}`;

    const failedRules = (regulationQuery.data?.results ?? [])
      .filter((r) => !r.passed && (r.severity === "ERROR" || r.severity === "WARNING"))
      .map((r) => ({
        nameHe: r.ruleNameHe,
        nameEn: r.ruleNameEn,
        deficit: Number((r.details as Record<string, unknown> | undefined)?.deficit ?? 0),
      }));

    return {
      isHe,
      effectiveTotal: b?.effectiveTotal ?? 0,
      earned: b?.earned ?? 0,
      planned: b?.planned ?? 0,
      miluimExemption: b?.miluimExemption ?? 0,
      mandatory: b?.mandatory ?? 0,
      elective: b?.elective ?? 0,
      seminar: b?.seminar ?? 0,
      focusAreaCredits: b?.focusArea ?? 0,
      focusAreaTarget: b?.focusAreaTarget ?? CREDIT_REQUIREMENTS.FOCUS_AREA_MIN,
      englishCourseCount: b?.englishCourseCount ?? 0,
      courseAverage: gradeQuery.data?.courseAverage ?? null,
      hasFocusArea: !!focusArea,
      focusAreaNameHe: focusCfg?.nameHe ?? null,
      focusAreaNameEn: focusCfg?.nameEn ?? null,
      currentYear: profile?.currentYear ?? 1,
      amiramScore: profile?.amiramScore ?? null,
      miluimGroupName: groupName,
      binaryRemaining: binaryCapRemaining(profile?.miluimBinaryUsed ?? 0, group),
      failedRules,
      seminarPlannedCount:
        planQuery.data?.courses?.filter((c) => c.course.courseType === "SEMINAR").length ?? 0,
    };
  }, [
    creditsQuery.data,
    gradeQuery.data,
    regulationQuery.data,
    profileQuery.data,
    semestersQuery.data,
    planQuery.data,
    isHe,
  ]);

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // Don't answer from empty defaults before the student's data has loaded.
  const dataReady = !creditsQuery.isLoading && !profileQuery.isLoading;

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    if (!dataReady) {
      toast.message(isHe ? "רגע, טוען את הנתונים שלך…" : "One sec, loading your data…");
      return;
    }
    setTurns((prev) => [...prev, { q, a: answerDegreeQuestion(q, ctx) }]);
    setInput("");
  };

  const chips = suggestedQuestions(isHe);

  return (
    <div className="flex min-h-[70vh] flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent-brand-muted text-accent-brand">
          <PhilosopherKingIcon className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground/90">
            {isHe
              ? `${greetNameForLocale(profileQuery.data, true) ? `${greetNameForLocale(profileQuery.data, true)}, ` : ""}${gendered(normalizeGender(profileQuery.data?.gender), { m: "שאל", f: "שאלי", n: "שאל/י" })} אותי על התואר שלך`
              : "Ask about your degree"}
          </h1>
          <p className="text-xs text-foreground/50">
            {isHe
              ? "תשובות מהנתונים שלך — בלי בינה מלאכותית, בלי המצאות."
              : "Answers from your own data — no AI, no made-up facts."}
          </p>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl">
        {turns.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/50 bg-foreground/[0.02] p-5 text-center text-sm text-foreground/50">
            {isHe ? "בחר שאלה למטה, או כתוב שאלה משלך 👇" : "Pick a question below, or type your own 👇"}
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-se-sm bg-accent-brand px-3.5 py-2 text-sm text-accent-brand-fg">
                {turn.q}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-ss-sm border border-border/60 bg-card px-3.5 py-2.5 text-sm text-foreground/80">
                <p className="whitespace-pre-line leading-relaxed"><Bidi text={turn.a.text} /></p>
                {turn.a.href && turn.a.cta && (
                  <Link
                    href={turn.a.href}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-brand transition-opacity hover:opacity-80"
                  >
                    {turn.a.cta}
                    <Arrow className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Suggested questions */}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => ask(c)}
            className="rounded-full border border-border/60 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/65 transition-colors hover:border-foreground/25 hover:bg-foreground/[0.06] hover:text-foreground/85"
          >
            {c}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isHe ? "כתוב שאלה על התואר…" : "Type a question about your degree…"}
          className="flex-1 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label={isHe ? "שלח" : "Send"}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
            input.trim()
              ? "bg-accent-brand text-accent-brand-fg hover:bg-accent-brand-hover"
              : "bg-foreground/10 text-foreground/30"
          )}
        >
          <Send className="size-4 rtl:-scale-x-100" />
        </button>
      </form>
    </div>
  );
}
