"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { X, Send, Zap, Bot, Loader2, Database, Mic, ImagePlus } from "lucide-react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { routeQuestion } from "@/lib/ai/answer-router";
import { suggestedQuestions } from "@/lib/degree-qa";
import { fileToBase64 } from "@/lib/upload";

/** Minimal surface of the browser SpeechRecognition API we use. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
import { useDegreeQAContext } from "@/components/mentor/use-qa-context";
import { hashContext, readCachedAnswer, writeCachedAnswer } from "@/lib/ai/answer-cache";

type Source = "rules" | "llm";
interface Msg {
  role: "user" | "assistant";
  content: string;
  source?: Source;
  href?: string;
  cta?: string;
  /** The assistant couldn't reach the LLM and offered a free fallback. */
  needsKey?: boolean;
  /** A thumbnail (object URL) for an image the student attached to the turn. */
  imagePreview?: string;
}

/**
 * The always-available floating assistant. One FAB on every protected screen
 * opens an "ask anything" panel (desktop) / bottom sheet (mobile). Answers run
 * through the hybrid router: a matched, non-reasoning question is answered
 * instantly and for free from the student's own data ("מהנתונים שלך"); an
 * open-ended one escalates to the LLM if a key (personal or shared) is
 * available, and otherwise degrades to the free answer + a gentle nudge —
 * never an error. Never auto-opens and never fires the LLM on its own.
 */
export function FloatingAssistant() {
  const isHe = useLocale() === "he";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  // ── Image attach ("photo & ask", Gemini vision) ──
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ b64: string; mime: string; preview: string } | null>(null);
  const attachImage = async (file: File) => {
    try {
      const { b64, mime } = await fileToBase64(file);
      // Revoke a prior preview before replacing it.
      setAttachedImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.preview);
        return { b64, mime, preview: URL.createObjectURL(file) };
      });
    } catch {
      toast.error(isHe ? "לא ניתן לצרף את התמונה" : "Couldn't attach the image");
    }
  };
  const clearImage = () =>
    setAttachedImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return null;
    });

  // ── Voice input (free, in-browser SpeechRecognition; he-IL) ──
  // Hidden entirely when the browser doesn't support it (e.g. Firefox).
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);
  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = isHe ? "he-IL" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]?.[0]?.transcript ?? "";
      if (text) setInput(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };
  const [streaming, setStreaming] = useState(false);

  // Only load the student's data once the King is opened — the FAB sits on every
  // protected page, so eager-loading 6 queries per page was needless load.
  const { ctx, ready } = useDegreeQAContext(open);
  const apiKeyQuery = api.ai.hasApiKey.useQuery(undefined, { staleTime: 60_000 });
  const aiAvailable = !!apiKeyQuery.data?.hasKey || !!apiKeyQuery.data?.sharedAvailable;

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  // The server chat session — carried across turns so the King REMEMBERS the
  // conversation. Without it every message was stateless (a follow-up like "כן"
  // got "that's not a question"). Set from the stream's `meta` event.
  const sessionIdRef = useRef<string | null>(null);

  // The full mentor page already IS the assistant — no floating duplicate there.
  const onMentorPage = pathname?.includes("/mentor");

  // Context-aware starter chips: the questions most relevant to the screen the
  // student is on, so the assistant meets them where they are instead of a
  // generic menu. Falls back to the general set on the dashboard/home.
  const chips = useMemo(() => {
    const all = suggestedQuestions(isHe);
    const pick = (...needles: string[]) =>
      needles.map((n) => all.find((q) => q.includes(n))).filter((q): q is string => !!q);
    const p = pathname ?? "";
    let scoped: string[] = [];
    if (p.includes("/planner")) {
      scoped = pick(isHe ? "מיקוד" : "focus", isHe ? "סמינרים" : "seminars", isHe ? "בידינג" : "bidding");
    } else if (p.includes("/catalog")) {
      scoped = pick(isHe ? "מיקוד" : "focus", isHe ? "בינארי" : "binary");
    } else if (p.includes("/graduation") || p.includes("/record")) {
      scoped = pick(isHe ? "ממוצע" : "average", isHe ? "הצטיינות" : "honors", isHe ? "בינארי" : "binary");
    } else if (p.includes("/regulations")) {
      scoped = pick(isHe ? "חסר" : "missing", isHe ? "מעבר" : "advance");
    } else if (p.includes("/settings")) {
      scoped = pick(isHe ? "מילואים" : "miluim", isHe ? "אנגלית" : "English");
    } else if (p.includes("/exam") || p.includes("/calendar")) {
      // The greeting talks exams — the chips must too (audit: the King offered
      // a capability here but surfaced unrelated questions).
      scoped = pick(isHe ? "מועד ב" : "Moed B", isHe ? "ציון גמר" : "final grade", isHe ? "מעבר" : "advance");
    }
    // Fill up to 5 with the general list, no duplicates.
    const merged = [...scoped];
    for (const q of all) {
      if (merged.length >= 5) break;
      if (!merged.includes(q)) merged.push(q);
    }
    return merged.slice(0, 5);
  }, [isHe, pathname]);

  // The King greets you by where you ARE — a present companion, not a blank box.
  const greeting = useMemo(() => {
    const p = pathname ?? "";
    const g = (he: string, en: string) => (isHe ? he : en);
    if (p.includes("/planner"))
      return g("אני רואה שאתה בתכנון הסמסטר. שאל אותי מה כדאי לקחת, אם העומס הגיוני, או איך לסגור פער.", "You're planning your semester. Ask me what to take, whether the load makes sense, or how to close a gap.");
    if (p.includes("/catalog"))
      return g("אתה מעיין בקטלוג. אעזור לך לבחור קורס שמתאים — קושי, התמחות, או דרישות-קדם.", "Browsing the catalog. I'll help you pick the right course — difficulty, focus area, or prerequisites.");
    if (p.includes("/regulations"))
      return g("אתה בתקנון. אסביר כל דרישה, למה היא חשובה, ואיך לסגור אותה.", "You're in the regulations. I'll explain any requirement, why it matters, and how to close it.");
    if (p.includes("/graduation") || p.includes("/record"))
      return g("אתה בתיק האקדמי. שאל על הממוצע, ההצטיינות, או איך לשפר.", "You're in your academic record. Ask about your average, honors, or how to improve.");
    if (p.includes("/exam"))
      return g("אתה בתכנון הבחינות. שאל אותי איך לפזר את הלמידה, או על מועד ב׳.", "You're in exam planning. Ask me how to spread your studying, or about the second sitting.");
    return g("שאל/י אותי כל דבר על התואר שלך — אני עונה מהנתונים שלך.", "Ask me anything about your degree — I answer from your data.");
  }, [pathname, isHe]);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Escape closes; return focus to the FAB.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Open (and optionally pre-fill) from anywhere in the app — a course card's
  // "ask about this" chip dispatches a `pk:ask` CustomEvent with a prompt, so
  // the King arrives already in the context of that object (Project 2 step 7).
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent).detail as { prompt?: string } | undefined;
      setOpen(true);
      if (detail?.prompt) setInput(detail.prompt);
    };
    window.addEventListener("pk:ask", onAsk as EventListener);
    return () => window.removeEventListener("pk:ask", onAsk as EventListener);
  }, []);

  const streamLLM = useCallback(
    async (
      question: string,
      planHash: string,
      cacheable: boolean,
      deterministicHint?: string,
      image?: { b64: string; mime: string },
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages((m) => [...m, { role: "assistant", content: "", source: "llm" }]);
      let full = "";
      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Carry the session so the King remembers the conversation, and the
          // router's verified answer (if any) so the model can't contradict it.
          body: JSON.stringify({
            message: question,
            sessionId: sessionIdRef.current ?? undefined,
            deterministicHint,
            imageBase64: image?.b64,
            imageMime: image?.mime,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no body");
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as { type: string; text?: string; error?: string; sessionId?: string };
              if (ev.type === "meta" && ev.sessionId) {
                sessionIdRef.current = ev.sessionId;
              } else if (ev.type === "delta" && ev.text) {
                full += ev.text;
                setMessages((m) => {
                  const u = [...m];
                  const last = u[u.length - 1];
                  if (last?.role === "assistant") u[u.length - 1] = { ...last, content: last.content + ev.text };
                  return u;
                });
              } else if (ev.type === "error") {
                throw new Error(ev.error || "stream error");
              }
            } catch {
              /* skip partial/keepalive lines */
            }
          }
        }
        // Cache only standalone first questions — follow-ups depend on the
        // conversation, so caching them by text alone would be wrong.
        if (cacheable && full.trim()) writeCachedAnswer(question, planHash, full);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Drop the empty streaming bubble and show the free fallback instead.
        setMessages((m) => {
          const u = m[m.length - 1]?.role === "assistant" && !m[m.length - 1]?.content ? m.slice(0, -1) : m;
          const fallback = routeQuestion(question, ctx).deterministic;
          return [
            ...u,
            {
              role: "assistant" as const,
              content: fallback.text,
              source: "rules" as const,
              href: fallback.href,
              cta: fallback.cta,
              needsKey: true,
            },
          ];
        });
        toast.error((err as Error).message || (isHe ? "שגיאה" : "Error"));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [ctx, isHe],
  );

  const send = useCallback(
    (raw: string) => {
      const question = raw.trim();
      const image = attachedImage;
      // An image needs a question OR defaults to a "what is this" prompt; text
      // alone still needs content.
      if ((!question && !image) || streaming || !ready) return;

      // ── Image path: always goes to the King (vision), bypassing the free
      //    router + cache. Needs a key; if none, tell the student where to add one.
      if (image) {
        const q = question || (isHe ? "מה זה? עזור/י לי להבין את זה בהקשר של התואר." : "What is this? Help me understand it in my degree context.");
        setInput("");
        // Persist the bubble thumbnail as a data URL — a stable copy that
        // survives clearImage() revoking the live attach preview's object URL
        // (otherwise the sent image renders broken).
        const bubbleSrc = `data:${image.mime};base64,${image.b64}`;
        clearImage();
        setMessages((m) => [...m, { role: "user", content: q, imagePreview: bubbleSrc }]);
        if (!aiAvailable) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: isHe
                ? "כדי לשאול על תמונה צריך מפתח Gemini חינמי (או המפתח המשותף). אפשר להוסיף בהגדרות."
                : "Asking about an image needs a free Gemini key (or the shared key). Add one in settings.",
              source: "rules",
              needsKey: true,
            },
          ]);
          return;
        }
        setStreaming(true);
        void streamLLM(q, hashContext(ctx), false, undefined, { b64: image.b64, mime: image.mime });
        return;
      }

      if (!question) return;
      setInput("");
      setMessages((m) => [...m, { role: "user", content: question }]);

      const decision = routeQuestion(question, ctx);

      // Free path: a matched, non-reasoning lookup answers instantly.
      if (!decision.shouldEscalate) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: decision.deterministic.text,
            source: "rules",
            href: decision.deterministic.href,
            cta: decision.deterministic.cta,
          },
        ]);
        return;
      }

      // Escalation: use the LLM if a key (personal or shared) is available;
      // otherwise degrade to the free answer + a nudge, never an error.
      if (aiAvailable) {
        // Only the FIRST question of a conversation is a standalone lookup we
        // can serve from cache; once a session exists, answers are contextual.
        const isFirst = !sessionIdRef.current;
        const planHash = hashContext(ctx);
        if (isFirst) {
          const cached = readCachedAnswer(question, planHash);
          if (cached) {
            setMessages((m) => [...m, { role: "assistant", content: cached, source: "llm" }]);
            return;
          }
        }
        setStreaming(true);
        // When the router ALSO has a verified deterministic answer, hand it to
        // the LLM as an authoritative base — so the King expands on the exact
        // numbers instead of re-deriving (and possibly contradicting) them.
        void streamLLM(
          question,
          planHash,
          isFirst,
          decision.matched ? decision.deterministic.text : undefined,
        );
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: decision.deterministic.text,
            source: "rules",
            href: decision.deterministic.href,
            cta: decision.deterministic.cta,
            needsKey: true,
          },
        ]);
      }
    },
    [ctx, aiAvailable, ready, streaming, streamLLM, attachedImage, isHe],
  );

  if (onMentorPage) return null;

  return (
    <>
      {/* FAB — sits above the mobile bottom-nav; mirrors to the inline-end. */}
      {!open && (
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={isHe ? "פתח/י את המלך הפילוסוף" : "Open the Philosopher King"}
          className={cn(
            "fixed bottom-20 end-4 z-[65] flex items-center gap-2 rounded-full py-3 shadow-lg md:bottom-6 md:end-6",
            "bg-accent-brand text-accent-brand-fg ring-1 ring-[#f2c879]/30 transition-all press-scale",
            "hover:bg-accent-brand-hover hover:shadow-xl hover:ring-[#f2c879]/60",
            "px-4",
          )}
        >
          <PhilosopherKingIcon className="size-5 text-[#f2c879]" />
          <span className="hidden text-sm font-semibold sm:inline">
            {isHe ? "המלך הפילוסוף" : "The Philosopher King"}
          </span>
        </button>
      )}

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-[1px] md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isHe ? "היועץ" : "Advisor"}
            dir={isHe ? "rtl" : "ltr"}
            className={cn(
              "fixed z-[66] flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
              // Mobile: bottom sheet. Desktop: anchored panel at the inline-end.
              "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl",
              "md:inset-x-auto md:bottom-6 md:end-6 md:h-[600px] md:max-h-[80vh] md:w-[400px] md:rounded-2xl",
              "animate-in fade-in slide-in-from-bottom-4 duration-200",
            )}
          >
            {/* Header — regal indigo with a gold crown (the Philosopher King). */}
            <div className="flex items-center gap-2.5 border-b border-border/60 bg-gradient-to-b from-accent-brand/[0.12] to-accent-brand/[0.04] px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-accent-brand text-[#f2c879] shadow-sm ring-1 ring-[#f2c879]/40">
                <PhilosopherKingIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-foreground/90">
                  {isHe ? "המלך הפילוסוף" : "The Philosopher King"}
                </p>
                <p className="text-[11px] text-foreground/50">
                  {aiAvailable
                    ? isHe ? "יועץ התואר שלך · חוכמה מהנתונים שלך" : "Your degree advisor · wisdom from your data"
                    : isHe ? "יועץ התואר שלך · תשובות מהנתונים שלך" : "Your degree advisor · answers from your data"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={isHe ? "סגור" : "Close"}
                className="rounded-md p-1.5 text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="flex flex-col gap-3 pt-2">
                  <p className="text-sm text-foreground/60">{greeting}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => send(c)}
                        className="rounded-full border border-border/70 bg-foreground/[0.02] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:border-accent-brand/40 hover:bg-accent-brand/[0.06] hover:text-foreground/90"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-accent-brand text-accent-brand-fg"
                        : "border border-border/60 bg-foreground/[0.02] text-foreground/85",
                    )}
                  >
                    {m.role === "assistant" && m.source && (
                      <span
                        className={cn(
                          "mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          m.source === "rules"
                            ? "bg-emerald-400/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-accent-brand/10 text-accent-brand",
                        )}
                      >
                        {m.source === "rules" ? <Database className="size-2.5" /> : <Bot className="size-2.5" />}
                        {m.source === "rules"
                          ? isHe ? "מהנתונים שלך" : "From your data"
                          : isHe ? "תשובת AI" : "AI answer"}
                      </span>
                    )}
                    {m.imagePreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.imagePreview}
                        alt=""
                        className="mb-1.5 max-h-40 w-auto rounded-lg border border-border/40"
                      />
                    )}
                    {m.role === "assistant" && m.source === "llm" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1">
                        <Markdown>{m.content || "…"}</Markdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line">{m.content}</p>
                    )}
                    {m.href && m.cta && (
                      <Link
                        href={m.href}
                        onClick={() => setOpen(false)}
                        className="mt-1.5 inline-block text-xs font-medium text-accent-brand underline underline-offset-2"
                      >
                        {m.cta}
                      </Link>
                    )}
                    {m.needsKey && !aiAvailable && (
                      <Link
                        href="/settings"
                        onClick={() => setOpen(false)}
                        className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-accent-brand"
                      >
                        <Zap className="size-3" />
                        {isHe ? "חבר/י מפתח חינמי לתשובות מעמיקות" : "Connect a free key for deeper answers"}
                      </Link>
                    )}
                  </div>
                </div>
              ))}

              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex items-center gap-1.5 px-1 text-xs text-foreground/40">
                  <Loader2 className="size-3 animate-spin" />
                  {isHe ? "חושב…" : "Thinking…"}
                </div>
              )}
            </div>

            {/* Attached-image preview strip */}
            {attachedImage && (
              <div className="flex items-center gap-2 border-t border-border/60 px-3 pt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachedImage.preview} alt="" className="size-12 rounded-lg border border-border/50 object-cover" />
                <span className="flex-1 text-xs text-foreground/55">{isHe ? "תמונה מצורפת — שאל/י עליה" : "Image attached — ask about it"}</span>
                <button type="button" onClick={clearImage} aria-label={isHe ? "הסר תמונה" : "Remove image"} className="rounded-md p-1 text-foreground/40 hover:text-foreground/70">
                  <X className="size-4" />
                </button>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-border/60 p-3"
            >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void attachImage(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={!ready || streaming}
                aria-label={isHe ? "צרף תמונה" : "Attach an image"}
                title={isHe ? "צלם ושאל" : "Photo & ask"}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 text-foreground/55 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:opacity-40"
              >
                <ImagePlus className="size-4" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  ready
                    ? attachedImage
                      ? isHe ? "שאל/י על התמונה…" : "Ask about the image…"
                      : isHe ? "כתוב/י שאלה…" : "Type a question…"
                    : isHe ? "טוען את הנתונים שלך…" : "Loading your data…"
                }
                disabled={!ready || streaming}
                className="flex-1 rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent-brand/50 disabled:opacity-60"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={!ready || streaming}
                  aria-label={isHe ? "דבר/י אל המלך" : "Speak to the King"}
                  aria-pressed={listening}
                  title={isHe ? "קלט קולי" : "Voice input"}
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40",
                    listening
                      ? "animate-pulse border-red-400/60 bg-red-500/10 text-red-500"
                      : "border-border/60 text-foreground/55 hover:bg-foreground/5 hover:text-foreground/80",
                  )}
                >
                  <Mic className="size-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={(!input.trim() && !attachedImage) || streaming || !ready}
                aria-label={isHe ? "שלח" : "Send"}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-brand text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-40"
              >
                <Send className="size-4 rtl:-scale-x-100" />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
