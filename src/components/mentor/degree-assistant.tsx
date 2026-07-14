"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Send, ArrowLeft, ArrowRight } from "lucide-react";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { Link } from "@/i18n/navigation";
import { greetNameForLocale, gendered, normalizeGender } from "@/lib/personal-address";
import { useDegreeQAContext } from "@/components/mentor/use-qa-context";
import {
  answerDegreeQuestion,
  suggestedQuestions,
  type QAAnswer,
} from "@/lib/degree-qa";
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

  // ONE source of truth with the floating assistant (use-qa-context) — the
  // inline copy of this context had drifted: it dropped `gender` (so /mentor
  // answers were ungendered) and read the fossilized stored semester
  // (spirit-audit 14.7).
  const { ctx, ready: dataReady } = useDegreeQAContext();
  // Greeting only — react-query dedupes with the hook's own profile query.
  const profileQuery = api.user.getProfile.useQuery(undefined, { retry: 1 });

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    if (!dataReady) {
      toast.message(isHe ? "רגע, טוען את הנתונים שלכם…" : "One sec, loading your data…");
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
            {isHe ? "בחרו שאלה למטה, או כתבו שאלה משלכם" : "Pick a question below, or type your own"}
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
          placeholder={isHe ? gendered(normalizeGender(profileQuery.data?.gender), { m: "כתוב שאלה על התואר…", f: "כתבי שאלה על התואר…", n: "כתוב/כתבי שאלה על התואר…" }) : "Type a question about your degree…"}
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
