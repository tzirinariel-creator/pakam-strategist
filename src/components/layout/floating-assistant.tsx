"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { usePersonalAddress } from "@/components/personal/use-personal-address";
import {
  X, Send, Zap, Loader2, Database, Mic, ImagePlus, ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { advisorError } from "@/lib/advisor-toast";
import { daysUntilLabel, nearestUpcomingExam } from "@/lib/days-until";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { ReferentIcon } from "@/components/ui/referent-icon";
import { PersonaCharacter, PersonaIcon, PersonaSwap, usePersona } from "@/components/persona/use-persona";
import { otherPersona, personaLabels } from "@/lib/persona";
import { routeQuestion } from "@/lib/ai/answer-router";
import { detectActions, type AssistantAction } from "@/lib/ai/action-router";
import { buildActionExamples, actionVerbsLine } from "@/lib/ai/assistant-examples";
import { invalidatePlanData } from "@/lib/trpc/invalidate-plan";
import { suggestedQuestions } from "@/lib/degree-qa";
import { getPlanningAnchor } from "@/lib/academic-calendar";
import { fileToBase64 } from "@/lib/upload";
import { Markdown } from "@/components/layout/assistant-markdown";
import { ProactiveNudgeCard } from "@/components/layout/proactive-nudge-card";
import {
  CHAT_IMAGE_ACCEPT,
  CHAT_IMAGE_MIME_SET,
  type Msg,
  type SpeechRecognitionLike,
} from "@/components/layout/floating-assistant.types";

import { useDegreeQAContext } from "@/components/mentor/use-qa-context";
import { hashContext, readCachedAnswer, writeCachedAnswer } from "@/lib/ai/answer-cache";


/**
 * The always-available floating assistant. One FAB on every protected screen
 * opens an "ask anything" panel (desktop) / bottom sheet (mobile). Answers run
 * through the hybrid router: a matched, non-reasoning question is answered
 * instantly and for free from the student's own data ("מהנתונים שלך"); an
 * open-ended one escalates to the LLM if a key (personal or shared) is
 * available, and otherwise degrades to the free answer + a gentle nudge —
 * never an error. Never fires the LLM on its own.
 *
 * Opens on its own EXACTLY ONCE (#11): a student who has just finished
 * onboarding gets one introduction, handed off from the end of the dashboard
 * tour, and never again. The previous blanket "never auto-opens" rule was a
 * misreading of Ariel's note 50 — which objected to the WORDING of an opening
 * line, not to its existence — and it silently blocked a feature he asked for
 * ten times over three months.
 */
export function FloatingAssistant() {
  const isHe = useLocale() === "he";
  const pathname = usePathname();
  const { gender, greetName, g: pg } = usePersonalAddress();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  // Advisor persona — the device-local choice (Settings → "דמות היועץ"), also
  // sent to the server with every question and validated there.
  // ONE shared store (components/persona/use-persona) instead of this file's
  // own localStorage effect. It resolves during hydration rather than in an
  // effect after paint — the trap this comment used to describe — and any
  // switch (here, in Settings, on /mentor) re-brands every mounted surface at
  // once. The FAB itself is painted by the SERVER, which cannot know a
  // device-local choice, so its face and name go through <PersonaSwap>: both
  // branches are rendered and CSS picks one from the very first frame.
  const { persona, isReferent, toggle } = usePersona();
  const labels = personaLabels(persona, isHe);
  const otherName = personaLabels(otherPersona(persona), isHe).short;
  // In-context persona switch (#48): a student who meets the King here must be
  // able to discover + switch to the Referent from the header itself — not only
  // buried in Settings.
  const switchPersona = () => toggle();
  const [input, setInput] = useState("");

  // ── Image attach ("photo & ask", Gemini vision) ──
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ b64: string; mime: string; preview: string } | null>(null);
  const attachImage = async (file: File) => {
    // Reject an unsupported type up front with a clear reason, instead of
    // attaching it and letting the server 415 it (or silently doing nothing).
    // An empty file.type (some HEIC pickers) is allowed through — the server
    // validates it. This mirrors the route's CHAT_IMAGE_MIME set.
    if (file.type && !CHAT_IMAGE_MIME_SET.has(file.type)) {
      toast.error(
        isHe
          ? "פורמט לא נתמך — אפשר JPG, PNG, WEBP או תמונה מהטלפון (HEIC)."
          : "Unsupported format — use JPG, PNG, WEBP, or a phone photo (HEIC).",
      );
      return;
    }
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
    // Surface WHY it stopped instead of failing silently — the #1 reason voice
    // "doesn't work" on desktop is a denied/blocked mic permission with no feedback.
    rec.onerror = (e) => {
      setListening(false);
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        toast.error(isHe ? pg("אין גישה למיקרופון — אפשר אותה בהגדרות הדפדפן ונסה שוב.", "אין גישה למיקרופון — אפשרי אותה בהגדרות הדפדפן ונסי שוב.", "אין גישה למיקרופון — אפשר/י אותה בהגדרות הדפדפן ונסה/י שוב.") : "No microphone access — allow it in your browser settings and try again.");
      } else if (err === "no-speech") {
        toast.error(isHe ? pg("לא נקלט קול — נסה שוב.", "לא נקלט קול — נסי שוב.", "לא נקלט קול — נסה/י שוב.") : "No speech detected — try again.");
      } else if (err && err !== "aborted") {
        advisorError(isHe ? pg("ההקלטה לא הצליחה — נסה שוב.", "הקלטה נכשלה — נסי שוב.", "הקלטה נכשלה — נסה/י שוב.") : "Voice input failed — try again.");
      }
    };
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      // start() throws if a previous session is still finalizing — reset quietly.
      setListening(false);
    }
  };
  const [streaming, setStreaming] = useState(false);

  // Only load the student's data once the King is opened — the FAB sits on every
  // protected page, so eager-loading 6 queries per page was needless load.
  const { ctx, ready, recommendations } = useDegreeQAContext(open);

  // ── Active assistant (#active-ai): the data the action detector needs. ──
  // Plan rows ride the SAME getUserPlan cache the app already holds; the full
  // catalog is fetched lazily, only after an add-intent is actually typed.
  const trpcUtils = api.useUtils();
  const planForActions = api.plan.getUserPlan.useQuery(undefined, { enabled: open, staleTime: 60_000 });
  // Catalog is small (117 courses) — warm it on OPEN so the first "תוסיף לי X"
  // action card fires immediately, with no type-then-submit race (audit HIGH).
  const catalogForActions = api.course.list.useQuery(undefined, { enabled: open, staleTime: 300_000 });
  const planLite = useMemo(
    () =>
      (planForActions.data?.courses ?? []).map((uc) => ({
        userCourseId: uc.id,
        nameHe: uc.course.nameHe,
        status: uc.status,
        courseType: uc.course.courseType,
      })),
    [planForActions.data],
  );
  const catalogLite = useMemo(
    () =>
      (catalogForActions.data ?? []).map((c) => ({ id: c.id, code: c.code, nameHe: c.nameHe })),
    [catalogForActions.data],
  );

  // #14 — the teachable "I can DO things" examples, built from the student's own
  // rows and VERIFIED against the real detector, so a tap never advertises a
  // confirm card that won't render. Empty plan → no chips, honest fallback line.
  const actionExamples = useMemo(
    () => buildActionExamples(planLite, catalogLite, isHe),
    [planLite, catalogLite, isHe],
  );

  const completeMutation = api.plan.updateCourse.useMutation();
  const addMutation = api.plan.addCourse.useMutation();
  const removeMutation = api.plan.removeCourse.useMutation();
  const updateEnglishMutation = api.user.updateProfile.useMutation();

  /** Confirm an action card — runs the SAME mutation the record/planner use. */
  const runAction = useCallback(
    async (msgIndex: number, action: AssistantAction) => {
      try {
        // Each branch runs the SAME tRPC mutation the record/planner use
        // (ownership + demo guards included) and builds its own honest
        // confirmation copy. No silent automation — the student already tapped.
        let successHe = "";
        let successEn = "";
        let href = "/planner";
        let ctaHe = "לתכנון התואר";
        switch (action.type) {
          case "COMPLETE_COURSE":
            await completeMutation.mutateAsync({
              userCourseId: action.userCourseId,
              status: "COMPLETED",
              ...(action.grade != null ? { grade: action.grade } : {}),
            });
            successHe = `בוצע! ${action.courseName} סומן כהושלם${action.grade != null ? ` עם ציון ${action.grade}` : ""}. אפשר לערוך תמיד בתיק האקדמי.`;
            successEn = `Done! ${action.courseName} marked completed${action.grade != null ? ` with grade ${action.grade}` : ""}.`;
            href = "/record";
            ctaHe = "לתיק האקדמי";
            break;
          case "MARK_FAILED":
            await completeMutation.mutateAsync({ userCourseId: action.userCourseId, status: "FAILED" });
            successHe = `סומן: ${action.courseName} — נכשל. אפשר להירשם שוב; הציון הקובע הוא של המועד האחרון.`;
            successEn = `Marked: ${action.courseName} as failed. You can retake it — the last sitting's grade is what counts.`;
            href = "/record";
            ctaHe = "לתיק האקדמי";
            break;
          case "DROP_COURSE":
            await removeMutation.mutateAsync({ userCourseId: action.userCourseId });
            successHe = `${action.courseName} הוסר מהתוכנית. תמיד אפשר להוסיף אותו שוב מהקטלוג.`;
            successEn = `${action.courseName} removed from your plan. You can add it back anytime from the catalog.`;
            href = "/planner";
            ctaHe = "לתכנון התואר";
            break;
          case "MOVE_COURSE":
            await completeMutation.mutateAsync({
              userCourseId: action.userCourseId,
              ...(action.plannedYear != null ? { plannedYear: action.plannedYear } : {}),
              ...(action.plannedSemester != null ? { plannedSemester: action.plannedSemester } : {}),
            });
            successHe = `${action.courseName} הועבר ל${action.targetLabel}. הציצו במתכנן שלא נוצרה חפיפה חדשה.`;
            successEn = `${action.courseName} moved to ${action.targetLabel}. Check the planner for any new clash.`;
            href = "/planner";
            ctaHe = "לתכנון התואר";
            break;
          case "SET_ENGLISH_LEVEL":
            await updateEnglishMutation.mutateAsync({ englishLevel: action.level });
            successHe = action.level === "EXEMPT"
              ? "בוצע! רמת-האנגלית עודכנה לפטור — כל הכבוד. בדיקת-המסלול כבר מתחשבת בזה."
              : "בוצע! רמת-האנגלית עודכנה. בדיקת-המסלול כבר מתחשבת בזה.";
            successEn = "Done! Your English level was updated — the track check reflects it.";
            href = "/regulations";
            ctaHe = "לבדיקת המסלול";
            break;
          case "ADD_COURSE":
            await addMutation.mutateAsync({
              courseId: action.courseId,
              // Year AT the anchor — pairing the anchor SEMESTER with today's
              // year filed a continuing student's add into the fall that already
              // ENDED (launch-gate 14.7).
              plannedYear: ctx.anchorYear ?? ctx.currentYear,
              // Stamp the PLANNING ANCHOR (→ FALL in July), not the wall-clock
              // semester — otherwise a fresh year-1's added course lands in a spurious
              // 1-SPRING bucket, which is what made the calendar open on ב׳ (QA 13.7).
              plannedSemester: getPlanningAnchor().semester,
            });
            successHe = `בוצע! ${action.courseName} נוסף לתוכנית לסמסטר הנוכחי — גררו אותו במתכנן אם מתאים לכם סמסטר אחר.`;
            successEn = `Done! ${action.courseName} added to the current semester — drag it in the planner if another fits better.`;
            href = "/planner";
            ctaHe = "לתכנון התואר";
            break;
        }
        invalidatePlanData(trpcUtils);
        setMessages((m) =>
          m.map((msg, i) => (i === msgIndex ? { ...msg, actionResolved: true } : msg)).concat({
            role: "assistant",
            source: "rules",
            content: isHe ? successHe : successEn,
            href,
            cta: isHe ? ctaHe : "Open",
          }),
        );
      } catch (e) {
        setMessages((m) =>
          m.concat({
            role: "assistant",
            source: "rules",
            content:
              (e as { message?: string })?.message ??
              (isHe ? "הפעולה לא הצליחה — נסו שוב." : "The action failed — try again."),
          }),
        );
      }
    },
    // ctx.anchorYear (the quick-add plannedYear) MUST be a dep — else an add
    // fired right after the anchor year changes files into the stale year
    // (research 14.7; anchorYear was added to ctx but not to these deps).
    [completeMutation, addMutation, removeMutation, updateEnglishMutation, ctx.currentYear, ctx.anchorYear, isHe, trpcUtils],
  );

  // ── Proactive suggestion (note #10, restrained per note #12) ──
  // The single most pressing gap (critical/warning only), surfaced ONLY when the
  // student opens the King (never unprompted), once per rec-id per day, globally
  // opt-out-able. A herald delivering one line, then silence — not Clippy.
  // Track WHICH rec was dismissed (not a bare boolean) so dismissing gap A never
  // suppresses a later, different critical gap B in the same session.
  const [dismissedRecId, setDismissedRecId] = useState<string | null>(null);

  // #15 — first-meeting intro: shown until dismissed once (localStorage).
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (!open) return;
    try {
      setShowIntro(localStorage.getItem("pk-met-advisor") !== "true");
    } catch {
      setShowIntro(false);
    }
  }, [open]);
  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem("pk-met-advisor", "true");
    } catch { /* storage blocked */ }
  };
  const topRec = useMemo(
    () => recommendations.find((r) => r.severity === "critical" || r.severity === "warning") ?? null,
    [recommendations],
  );
  const [nudgeAllowed, setNudgeAllowed] = useState(false);
  useEffect(() => {
    if (!open || !topRec) {
      setNudgeAllowed(false);
      return;
    }
    try {
      if (localStorage.getItem("pk-proactive-off")) {
        setNudgeAllowed(false);
        return;
      }
      const seen = localStorage.getItem(`pk-rec-nudge:${topRec.id}`);
      setNudgeAllowed(seen !== new Date().toISOString().slice(0, 10));
    } catch {
      setNudgeAllowed(false);
    }
  }, [open, topRec]);
  const proactiveNudge = nudgeAllowed && topRec && dismissedRecId !== topRec.id ? topRec : null;

  // The closed-FAB dot (retention #2): the only in-app attention signal that
  // lives on EVERY screen. Shown when there's a real critical/warning gap the
  // user hasn't dismissed today and hasn't globally muted — computed WITHOUT
  // `open` so it pulls the user IN rather than only rewarding an open.
  const [fabAlert, setFabAlert] = useState(false);
  useEffect(() => {
    if (!topRec) { setFabAlert(false); return; }
    try {
      if (localStorage.getItem("pk-proactive-off")) { setFabAlert(false); return; }
      const seen = localStorage.getItem(`pk-rec-nudge:${topRec.id}`);
      setFabAlert(seen !== new Date().toISOString().slice(0, 10) && dismissedRecId !== topRec.id);
    } catch {
      setFabAlert(false);
    }
  }, [topRec, dismissedRecId]);
  const markNudgeSeen = () => {
    if (topRec) {
      try {
        localStorage.setItem(`pk-rec-nudge:${topRec.id}`, new Date().toISOString().slice(0, 10));
      } catch {
        /* storage unavailable — the in-memory dismiss still hides it this session */
      }
      setDismissedRecId(topRec.id);
    }
  };
  const apiKeyQuery = api.ai.hasApiKey.useQuery(undefined, { staleTime: 60_000 });
  const aiAvailable = !!apiKeyQuery.data?.hasKey || !!apiKeyQuery.data?.sharedAvailable;
  // A student who added their OWN Claude key won't fall back to the shared free
  // Gemini key — but image chat is Gemini-vision only, so that path 415s. Knowing
  // the provider lets us explain the fix BEFORE sending, instead of after.
  const keyProvider = apiKeyQuery.data?.provider ?? null;

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
    const out = merged.slice(0, 5);
    // 18:19 (#7) — on the first meeting, invite the "who are you?" question so
    // the advisor's story is one tap away.
    if (showIntro) out.unshift(isHe ? "מי אתה?" : "Who are you?");
    return out.slice(0, 5);
  }, [isHe, pathname, showIntro]);

  // The King greets you by where you ARE — a present companion, not a blank box.
  // Hebrew is gendered by the student's gender (unknown → inclusive "/" form).
  const greeting = useMemo(() => {
    const p = pathname ?? "";
    const gg = (m: string, f: string, n: string) =>
      gender === "male" ? m : gender === "female" ? f : n;
    const ask = gg("שאל", "שאלי", "שאל/י");
    // Adaptive lead (#10) — if a REAL exam from the student's OWN plan is close,
    // the King opens with it: grounded in their calendar (never invented, never
    // creepy) and immediately actionable. Only within ~14 days, and skipped on
    // the exam-planner screen itself (they're already looking at it). Uses the
    // SAME civil-day source as the dashboard countdown, so the numbers agree.
    const examLead = (() => {
      if (p.includes("/exam")) return null;
      const next = nearestUpcomingExam(planForActions.data?.courses ?? []);
      if (!next || next.days > 14) return null;
      const name = isHe ? next.nameHe : (next.nameEn ?? next.nameHe);
      const when = daysUntilLabel(next.days, isHe);
      return isHe
        ? `${name} ${when}. רוצה שנפזר את הלמידה נכון עד אז?`
        : `${name} exam ${when}. Want to map out your studying until then?`;
    })();
    if (examLead) return examLead;
    if (!isHe) {
      if (p.includes("/planner")) return "You're planning your semester. Ask me what to take, whether the load makes sense, or how to close a gap.";
      if (p.includes("/catalog")) return "Browsing the catalog. I'll help you pick the right course — difficulty, focus area, or prerequisites.";
      if (p.includes("/regulations")) return "You're in the regulations. I'll explain any requirement, why it matters, and how to close it.";
      if (p.includes("/graduation") || p.includes("/record")) return "You're in your academic record. Ask about your average, honors, or how to improve.";
      if (p.includes("/exam")) return "You're in exam planning. Ask me how to spread your studying, or about the second sitting.";
      return "Ask me anything about your degree — my answers are based on your own data.";
    }
    if (p.includes("/planner"))
      return `תכנון הסמסטר. ${ask} מה כדאי לקחת, אם העומס מאוזן, או איך לסגור פער — אענה מהמספרים שלך.`;
    if (p.includes("/catalog"))
      return `הקטלוג פתוח. ${ask} על קורס — כמה הוא קשה, איך הוא משתלב בתחום המיקוד, או דרישות-הקדם.`;
    if (p.includes("/regulations"))
      return `בדיקת המסלול. ${ask} על כל דרישה — למה היא חשובה, ומה בדיוק לעשות כדי לסגור אותה.`;
    if (p.includes("/graduation") || p.includes("/record"))
      return `התיק האקדמי. ${ask} על הממוצע, על ההצטיינות, או איך לשפר ציון לפני שהוא ננעל.`;
    if (p.includes("/exam"))
      return `תקופת המבחנים. ${ask} איך לפזר את הלמידה נכון, או מתי מועד ב׳ באמת שווה.`;
    return `${ask} אותי כל שאלה על התואר — התשובות שלי מבוססות על הנתונים האישיים שלך.`;
  }, [pathname, isHe, gender, planForActions.data]);

  // Auto-focus the input ONLY on desktop. On touch (the whole target audience)
  // an auto-focus pops the keyboard the instant the panel opens, hiding the
  // greeting + suggested-question chips the user is meant to tap first (C1).
  useEffect(() => {
    if (!open) return;
    const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (isTouch) return;
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Keyboard-inset handling (C1): on mobile the bottom-sheet is position:fixed
  // bottom:0, so an on-screen keyboard covers the input + newest message. Track
  // the visualViewport and lift the sheet by the covered height. No-op on
  // desktop (no visualViewport shrink) and gracefully absent on old browsers.
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setKbInset(covered > 80 ? covered : 0); // ignore tiny toolbars
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKbInset(0);
    };
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

  // #11 (13.8) — the King introduces himself, ONCE, to a brand-new student.
  //
  // Ariel asked for this repeatedly ("ביקשתי את זה כבר 100 פעם ב-10 מקומות
  // שונים") and it was never built. It was, in fact, forbidden: this file's own
  // header carried a "never auto-opens" rule, and meet-the-advisor-card.tsx
  // restated it as product law. That rule was derived from his note 50 — where
  // he criticised the WORDING of the opening line as AI-sounding, not the idea
  // of an opening line. A copy note became a feature ban and nobody noticed.
  //
  // The rule was right about one thing, so that part is kept: this is not
  // Clippy. It fires exactly once, only for a student who just completed
  // onboarding, only after the dashboard tour has finished (so two overlays
  // never fight), and it never fires again on any later visit. The King says
  // hello and then waits — he does not call the LLM, and he asks nothing.
  useEffect(() => {
    const onGreet = () => {
      try {
        if (localStorage.getItem("pk-king-greeted") === "true") return;
        localStorage.setItem("pk-king-greeted", "true");
      } catch {
        return; // storage blocked — better silent than greeting on every load
      }
      const name = greetName ? ` ${greetName}` : "";
      // Deliberately carries no ש״ס / average / gap figure. The plan has only
      // just been written, the advisor's own queries may not have refetched
      // yet, and a greeting is exactly the wrong place to risk a stale number
      // (#13/#14 is the same failure one screen earlier).
      const tryLine = pg("נסה למשל", "נסי למשל", "אפשר לנסות");
      const hello = isReferent
        ? isHe
          ? `היי${name}, אני הרפרנט.\n\nהתוכנית שלך כבר אצלי — הקורסים, הציונים, המילואים והתקנון. אפשר לשאול אותי בשפה רגילה, ואני עונה מהנתונים שלך ולא מהאינטרנט.\n\n${tryLine}: "כמה ש״ס נשארו לי?", "מה הכי דחוף עכשיו?", או "תוסיף לי מיקרו ב׳ לסמסטר הבא" — כן, גם לבצע דברים.\n\nלא אקפוץ יותר מעצמי. כש${pg("תצטרך", "תצטרכי", "תצטרכו")} אותי, אני כאן למטה.`
          : `Hey${name}, I'm the Referent.\n\nI already have your plan — courses, grades, reserve duty and the regulations. Ask me in plain language and I answer from your data, not from the internet.\n\nTry: "how many credits do I have left?", "what's most urgent right now?", or "add Micro B to next semester" — yes, I can act too.\n\nI won't pop up on my own again. I'm down here when you need me.`
        : isHe
          ? `שלום${name}, אני המלך הפילוסוף.\n\nהתוכנית שלך שמורה אצלי — הקורסים, הציונים, המילואים והתקנון. מכאן אפשר פשוט לשאול אותי דברים בשפה רגילה, ואני עונה מהנתונים שלך, לא מהאינטרנט.\n\n${tryLine}: "כמה ש״ס נשארו לי?", "מה הכי דחוף עכשיו?", או "תוסיף לי מיקרו ב׳ לסמסטר הבא" — כן, גם לבצע דברים.\n\nאני לא קופץ מעצמי יותר. כשתצטרך אותי, אני כאן למטה.`
          : `Hello${name}, I'm the Philosopher King.\n\nI have your plan — courses, grades, reserve duty and the regulations. From here you can just ask me things in plain language, and I answer from your data, not from the internet.\n\nTry: "how many credits do I have left?", "what's most urgent right now?", or "add Micro B to next semester" — yes, I can act too.\n\nI won't pop up on my own again. I'll be down here when you need me.`;
      setMessages([{ role: "assistant", content: hello, source: "rules" }]);
      setOpen(true);
    };
    window.addEventListener("pk:greet", onGreet);
    return () => window.removeEventListener("pk:greet", onGreet);
  }, [isHe, greetName, pg, isReferent]);

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
            persona,
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
        let wasTruncated = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            // Parse inside a guard (keepalive/partial lines aren't valid JSON) —
            // but HANDLE the event OUTSIDE it, so a server "error" event reaches
            // the outer catch (fallback + message) instead of being swallowed as
            // a parse skip and leaving a stuck "…" bubble forever.
            let ev: { type: string; text?: string; error?: string; sessionId?: string };
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue; /* partial/keepalive line */
            }
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
            } else if (ev.type === "truncated") {
              // A cut answer invites "המשך" — serving it from cache later would
              // reach a King with no session history. Never cache it. (#36)
              wasTruncated = true;
            } else if (ev.type === "error") {
              throw new Error(ev.error || "stream error");
            }
          }
        }
        // Cache only standalone first questions — follow-ups depend on the
        // conversation, so caching them by text alone would be wrong.
        if (cacheable && full.trim() && !wasTruncated) writeCachedAnswer(question, planHash, full, persona);
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
    [ctx, isHe, persona],
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
        const q = question || (isHe ? "מה זה? עזור לי להבין את זה בהקשר של התואר." : "What is this? Help me understand it in my degree context.");
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
        // The student has their own Claude key, so the shared free Gemini key
        // isn't used for them — but image questions are Gemini-vision only.
        // Explain the fix here instead of letting the server 415.
        if (keyProvider === "anthropic") {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: isHe
                ? "שאלות עם תמונה עובדות עם Gemini (חינמי), לא עם Claude. אפשר להסיר את מפתח Claude בהגדרות כדי להשתמש במפתח המשותף החינמי — או להוסיף מפתח Gemini."
                : "Image questions use Gemini (free), not Claude. Remove your Claude key in settings to use the shared free key — or add a Gemini key.",
              source: "rules",
              href: "/settings",
              cta: isHe ? "להגדרות" : "Settings",
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

      // ── Active assistant (#active-ai): a doable request becomes a confirm
      // card instead of an answer. Detection is deterministic + tested;
      // nothing executes until the student clicks אישור.
      const detected = detectActions(question, planLite, catalogLite);
      if (detected.length > 0) {
        const proposalContent = (action: AssistantAction): string => {
          switch (action.type) {
            case "COMPLETE_COURSE":
              return isHe
                ? `מעדכן שסיימתם את ${action.courseName}${action.grade != null ? ` עם ציון ${action.grade}` : ""} — לאשר?`
                : `Mark ${action.courseName} as completed${action.grade != null ? ` with grade ${action.grade}` : ""}?`;
            case "MARK_FAILED":
              return isHe
                ? `לסמן את ${action.courseName} כנכשל? (תמיד אפשר להירשם שוב — הציון הקובע הוא של המועד האחרון.)`
                : `Mark ${action.courseName} as failed? (You can always retake it.)`;
            case "DROP_COURSE":
              return isHe
                ? `להוריד את ${action.courseName} מהתוכנית? אפשר להוסיף אותו שוב בכל רגע.`
                : `Remove ${action.courseName} from your plan? You can add it back anytime.`;
            case "MOVE_COURSE":
              return isHe
                ? `להעביר את ${action.courseName} ל${action.targetLabel}?`
                : `Move ${action.courseName} to ${action.targetLabel}?`;
            case "SET_ENGLISH_LEVEL":
              return isHe
                ? action.level === "EXEMPT"
                  ? `סיימתם את קורס ${action.levelNameHe} — זה אומר שהגעתם לפטור באנגלית! לעדכן את הרמה לפטור?`
                  : `סיימתם את קורס ${action.levelNameHe} — מעדכן את רמת-האנגלית שלכם בהתאם?`
                : `You finished the ${action.levelNameHe} course — update your English level accordingly?`;
            case "ADD_COURSE":
              return isHe
                ? `מוסיף את ${action.courseName} לתוכנית שלכם (הסמסטר הנוכחי) — לאשר?`
                : `Add ${action.courseName} to your plan (current semester)?`;
          }
        };
        const proposals = detected.map((action) => ({
          role: "assistant" as const,
          source: "rules" as const,
          action,
          content: proposalContent(action),
        }));
        setMessages((m) => [...m, ...proposals]);
        return;
      }

      const decision = routeQuestion(question, ctx, { hasHistory: messages.length > 0 });

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
        const isFirst = !sessionIdRef.current && messages.length === 0;
        const planHash = hashContext(ctx);
        if (isFirst) {
          const cached = readCachedAnswer(question, planHash, persona);
          if (cached) {
            setMessages((m) => [...m, { role: "assistant", content: cached, source: "llm" }]);
            return;
          }
        }
        setStreaming(true);
        // When the router ALSO has a verified deterministic answer, hand it to
        // the LLM as an authoritative base — so the King expands on the exact
        // numbers instead of re-deriving (and possibly contradicting) them.
        // EXCEPT when escalation happened because the question names a specific
        // catalog course (reason "course-code"): the keyword scorer's "match" in
        // that case is exactly the false positive being escalated away from
        // (24.7 live-QA — a course-code question scored onto the bare "ממוצע"
        // personal-GPA handler), so handing its text over as a "verified" hint
        // would just reintroduce the wrong answer through the back door.
        void streamLLM(
          question,
          planHash,
          isFirst,
          // …and NOT for "social" either (#22): handing the canned pleasantry
          // over as an authoritative base is how the persona ends up parroting
          // a fixed line instead of actually being warm in its own voice.
          decision.matched && decision.reason !== "course-code" && decision.reason !== "social"
            ? decision.deterministic.text
            : undefined,
        );
      } else if (decision.reason === "course-code") {
        // No AI key at all: we can't answer a specific-course question honestly
        // (the rules engine only knows the student's OWN data), and showing the
        // mismatched deterministic text here would be the same false positive.
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: isHe
              ? "אין לי דרך לענות על שאלה על קורס ספציפי בלי מפתח AI מחובר — אפשר להוסיף מפתח חינמי בהגדרות, או לחפש את הקורס בקטלוג."
              : "I can't answer a question about a specific course without a connected AI key — add a free one in settings, or look the course up in the catalog.",
            source: "rules",
            href: "/catalog",
            cta: isHe ? "לקטלוג הקורסים" : "Course catalog",
            needsKey: true,
          },
        ]);
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
    // `persona` MUST be here: send() reads the persona-scoped answer cache
    // (readCachedAnswer above) — without it, a student who switches King↔Referent
    // mid-chat gets the OTHER persona's cached answer (research 14.7).
    [ctx, aiAvailable, keyProvider, ready, streaming, streamLLM, attachedImage, isHe, messages.length, planLite, catalogLite, persona],
  );

  if (onMentorPage) return null;

  return (
    <>
      {/* FAB — sits above the mobile bottom-nav; mirrors to the inline-end. */}
      {!open && (
        <button
          ref={fabRef}
          type="button"
          data-tour="king"
          onClick={() => setOpen(true)}
          aria-label={isHe ? pg(`פתח את ${labels.name}`, `פתחי את ${labels.name}`, `פתח/י את ${labels.name}`) : `Open ${labels.name}`}
          className={cn(
            "fixed bottom-[calc(5rem+var(--safe-bottom))] end-4 z-[65] flex items-center gap-2 rounded-full py-3 shadow-lg md:bottom-6 md:end-6",
            "bg-accent-brand text-accent-brand-fg ring-1 ring-crown-gold-bright/30 transition-all press-scale",
            "hover:bg-accent-brand-hover hover:shadow-xl hover:ring-crown-gold-bright/60",
            "px-4",
          )}
        >
          <PersonaSwap
            king={<PhilosopherKingIcon className="size-5 shrink-0 text-crown-gold-bright" />}
            referent={<ReferentIcon className="size-5 shrink-0 text-referent-teal" />}
          />
          {fabAlert && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -top-0.5 end-2 size-2.5 rounded-full ring-2 ring-accent-brand",
                topRec?.severity === "critical" ? "bg-red-500" : "bg-amber-400",
              )}
            />
          )}
          {/* Label shows on EVERY width now (was sm:inline only) — the audience is
              mobile, and an icon-only FAB is exactly why "15 minutes in and I never
              met the King" (#13/#26). Naming him on the button introduces him. */}
          <span className="text-sm font-semibold">
            <PersonaSwap
              king={isHe ? "המלך הפילוסוף" : "The Philosopher King"}
              referent={isHe ? "הרפרנט" : "The Referent"}
            />
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
            aria-label={labels.name}
            dir={isHe ? "rtl" : "ltr"}
            style={kbInset > 0 ? { bottom: `${kbInset}px` } : undefined}
            className={cn(
              "fixed z-[66] flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
              // Mobile: bottom sheet. Desktop: anchored panel at the inline-end.
              "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl",
              "md:inset-x-auto md:bottom-6 md:end-6 md:h-[600px] md:max-h-[80vh] md:w-[400px] md:rounded-2xl md:!bottom-6",
              "animate-in fade-in slide-in-from-bottom-4 duration-200",
            )}
          >
            {/* Header — regal indigo with a gold crown (the Philosopher King). */}
            <div className="flex items-center gap-2.5 border-b border-border/60 bg-gradient-to-b from-accent-brand/[0.12] to-accent-brand/[0.04] px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-accent-brand text-crown-gold-bright shadow-sm ring-1 ring-crown-gold-bright/40">
                <PersonaIcon
                  className={cn("size-5", isReferent && "text-referent-teal")}
                  state={streaming ? "thinking" : "idle"}
                  dot={proactiveNudge ? (proactiveNudge.severity as "critical" | "warning") : null}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-foreground/90">{labels.name}</p>
                <p className="text-[11px] text-foreground/50">
                  {isReferent
                    ? isHe ? "שנה ג׳ שכבר עבר את זה · דוגרי, מהנתונים שלכם" : "A final-year who's been through it · straight talk, from your data"
                    : aiAvailable
                      ? isHe ? "יועץ התואר שלכם · חוכמה מהנתונים שלכם" : "Your degree advisor · wisdom from your data"
                      : isHe ? "יועץ התואר שלכם · תשובות מהנתונים שלכם" : "Your degree advisor · answers from your data"}
                </p>
              </div>
              {/* A generic swap icon, not the other persona's own portrait — showing
                  a second full character illustration right next to the current
                  persona's own icon read as "two logos for one character" (24.7
                  audit). The label/title still name who you'd switch to. */}
              {/* #16 (13.8) — this used to be a bare icon of the same size,
                  flush against the close button, with no label and no undo. A
                  mis-tap silently and permanently changed which advisor you
                  have; Ariel reported landing on the Referent without ever
                  choosing it. (Its main cause was a localStorage leak, fixed
                  separately, but this made it easy to repeat.) Now it carries
                  its text, is visually separated from Close, and is
                  undoable from the toast. */}
              <button
                type="button"
                onClick={() => {
                  // Two bugs Ariel caught in one line (#24): the toast read
                  // "עברתם להרפרנט … חזרה להרפרנט" — both sides naming the SAME
                  // persona, because `back` was computed from the same branch as
                  // the destination. And "ל" + a definite noun contracts in
                  // Hebrew: "להרפרנט" is not a word, "לרפרנט" is — which is why
                  // personaLabels carries a `bare` form for exactly this spot.
                  const to = personaLabels(otherPersona(persona), isHe);
                  const back = personaLabels(persona, isHe);
                  switchPersona();
                  toast.success(
                    isHe ? `עברתם ל${to.bare}` : `Switched to ${to.name}`,
                    {
                      action: {
                        label: isHe ? `חזרה ל${back.bare}` : `Back to ${back.name}`,
                        onClick: () => switchPersona(),
                      },
                    },
                  );
                }}
                aria-label={isHe ? `החליפו ל${otherName}` : `Switch to ${otherName}`}
                title={isHe ? `העדפת ${otherName}? החליפו` : `Prefer ${otherName}? Switch`}
                className="me-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
              >
                <ArrowLeftRight className="size-3.5" />
                <span className="hidden sm:inline">{otherName}</span>
              </button>
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
                  {proactiveNudge && (
                    <ProactiveNudgeCard
                      rec={proactiveNudge}
                      isHe={isHe}
                      onAct={() => {
                        markNudgeSeen();
                        setOpen(false);
                      }}
                      onDismiss={markNudgeSeen}
                    />
                  )}
                  <div className="flex justify-center pt-1">
                    <PersonaCharacter className="size-20 drop-shadow-md pk-float" title={labels.name} />
                  </div>
                  {/* #15 (12.7) — a real first meeting: the advisor introduces
                      HIMSELF once, in his own voice, before any question. It is
                      the one moment in the app that is a genuine introduction,
                      so it is also the one that opens with the student's name
                      (a vocative — it doesn't touch the plural product voice).
                      Everywhere else the name would be repetition, not warmth. */}
                  {showIntro && (
                    <div className="rounded-xl border border-border/60 bg-foreground/[0.03] p-3 text-sm leading-relaxed text-foreground/70">
                      {isReferent
                        ? isHe
                          ? `נעים מאוד${greetName ? `, ${greetName}` : ""}, אני הרפרנט — שנה ג׳ בפכ״מ, כבר עברתי את כל מה שמחכה לכם. שואלים אותי הכול בגובה העיניים, ואני עונה לפי הנתונים שלכם, לא מהזיכרון. וגם: תגידו לי שסיימתם קורס או שאתם רוצים להוסיף אחד, ואני מקפיץ כרטיס-אישור שמעדכן את התוכנית בפועל. ואם בא לכם סגנון מכובד יותר — יש למעלה כפתור שמחליף אותי במלך.`
                          : `Hey${greetName ? ` ${greetName}` : ""}, I'm the Referent — a final-year PPE student who's been through everything ahead of you. Ask me anything, I answer from your data. And tell me you finished a course or want to add one — I'll raise a confirm card that actually updates your plan. Prefer a more regal style? The button above swaps me for the King.`
                        : isHe
                          ? `נעים מאוד${greetName ? `, ${greetName}` : ""} — אני המלך הפילוסוף, היועץ האישי שלכם לתואר. השם מאפלטון: ב„מדינה” הוא תיאר מנהיג שמוביל לפי ידע ולא לפי דעה, ותמיד לטובת מי שהוא מוביל — וזה בדיוק התפקיד שלי כאן. אני מכיר את התקנון, את הקטלוג ואת הנתונים שלכם, ומכוון למה שנכון לכם, לא לממוצע. שאלו אותי כל דבר — ואם תספרו לי שסיימתם קורס, שנכשלתם באחד או שבא לכם להוסיף אחד, אני מקפיץ כרטיס-אישור ומבצע ברגע שתאשרו. מעדיפים סגנון של חבר משנה ג׳? הכפתור למעלה מחליף אותי ברפרנט.`
                          : `A pleasure${greetName ? `, ${greetName}` : ""} — I'm the Philosopher King, your personal degree advisor. The name is Plato's: in the Republic he pictured a leader who guides by knowledge, not opinion, and always for the good of those they lead — which is exactly my role here. I know the regulations, the catalog and your own data, and I aim for what's right for you, not the average. Ask me anything — and when you tell me you finished a course, failed one, or want to add one, I'll raise a confirm card and do it the moment you approve. Prefer a peer's tone? The button above swaps me for the Referent.`}
                      <button
                        type="button"
                        onClick={dismissIntro}
                        className="mt-2 block text-xs text-accent-brand hover:underline"
                      >
                        {isHe ? "הבנתי, בואו נתחיל" : "Got it, let's go"}
                      </button>
                    </div>
                  )}
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

                  {/* #14 — teach the capability nobody discovered: the advisor
                      doesn't only answer, it turns a sentence into a real change
                      in the plan. These chips PRE-FILL the input instead of
                      sending, because the example carries a placeholder grade —
                      the student edits it, so no number is ever filed that they
                      didn't type. Every chip was verified against the real
                      detector, so tapping one always ends in a confirm card. */}
                  <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-2.5">
                    <p className="mb-1.5 text-[11px] font-semibold text-foreground/60">
                      {isHe ? "ואני לא רק עונה — אני גם מבצע" : "And I don't only answer — I act"}
                    </p>
                    {actionExamples.length > 0 ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {actionExamples.map((ex) => (
                            <button
                              key={ex.prompt}
                              type="button"
                              onClick={() => {
                                setInput(ex.prompt);
                                inputRef.current?.focus();
                              }}
                              className="rounded-full border border-accent-brand/30 bg-accent-brand/[0.06] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-accent-brand/60 hover:text-foreground"
                            >
                              {ex.prompt}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
                          {isHe
                            ? "לחיצה ממלאת את שורת הכתיבה — ערכו את הפרטים ושלחו. לפני כל שינוי תקבלו כרטיס-אישור, וכלום לא זז בלי לחיצה שלכם."
                            : "Tapping fills the input — edit the details and send. A confirm card always comes first; nothing moves without your click."}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-foreground/45">
                        {actionVerbsLine(isHe)}
                      </p>
                    )}
                  </div>
                  {/* Quota transparency (note #25): when the student is on the
                      shared free key (no BYOK), say so calmly — with the free way
                      out of the small daily cap. BYOK users never see this. */}
                  {!apiKeyQuery.data?.hasKey && apiKeyQuery.data?.sharedAvailable && (
                    <p className="text-[11px] leading-relaxed text-foreground/40">
                      {isHe ? "אתם על המכסה החינמית המשותפת — עובד מצוין. אם היא נגמרת לכם, " : "You're on the free shared quota — works great. If it runs out, "}
                      <Link href="/settings" className="text-accent-brand/80 underline-offset-2 hover:underline">
                        {isHe ? "מפתח Gemini אישי (גם חינם)" : "a personal Gemini key (also free)"}
                      </Link>
                      {isHe ? " נותן לכם מכסה פרטית." : " gives you a private one."}
                    </p>
                  )}
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
                        {m.source === "rules"
                          ? <Database className="size-2.5" />
                          : <PersonaIcon className="size-2.5" />}
                        {m.source === "rules"
                          ? isHe ? "מהנתונים שלכם" : "From your data"
                          : isHe ? `תשובת ${labels.short}` : labels.name}
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
                    {/* #active-ai — the confirm card: nothing runs until אישור */}
                    {m.action && !m.actionResolved && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={completeMutation.isPending || addMutation.isPending || removeMutation.isPending}
                          onClick={() => void runAction(i, m.action!)}
                          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                        >
                          {completeMutation.isPending || addMutation.isPending || removeMutation.isPending
                            ? (isHe ? "מבצע…" : "Working…")
                            : (isHe ? "אישור — בצע" : "Confirm")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMessages((all) =>
                              all.map((msg, j) => (j === i ? { ...msg, actionResolved: true } : msg)).concat({
                                role: "assistant",
                                source: "rules",
                                content: isHe ? "בוטל — לא שיניתי כלום." : "Cancelled — nothing changed.",
                              }),
                            )
                          }
                          className="rounded-lg bg-foreground/8 px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/15"
                        >
                          {isHe ? "ביטול" : "Cancel"}
                        </button>
                      </div>
                    )}
                    {m.action && m.actionResolved && (
                      <p className="mt-1 text-[11px] text-foreground/40">
                        {isHe ? "✓ טופל" : "✓ handled"}
                      </p>
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
                        {isHe ? pg("חבר מפתח חינמי לתשובות מעמיקות", "חברי מפתח חינמי לתשובות מעמיקות", "חבר/י מפתח חינמי לתשובות מעמיקות") : "Connect a free key for deeper answers"}
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
                <span className="flex-1 text-xs text-foreground/55">{isHe ? pg("תמונה מצורפת — שאל עליה", "תמונה מצורפת — שאלי עליה", "תמונה מצורפת — שאל/י עליה") : "Image attached — ask about it"}</span>
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
                accept={CHAT_IMAGE_ACCEPT}
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
                      ? isHe ? pg("שאל על התמונה…", "שאלי על התמונה…", "שאל/י על התמונה…") : "Ask about the image…"
                      : isHe ? pg("כתוב שאלה…", "כתבי שאלה…", "כתוב/י שאלה…") : "Type a question…"
                    : isHe ? "טוען את הנתונים שלכם…" : "Loading your data…"
                }
                disabled={!ready || streaming}
                aria-label={isHe ? `שאלה אל ${labels.name}` : `Question for ${labels.name}`}
                className="flex-1 rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent-brand/50 disabled:opacity-60"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={!ready || streaming}
                  aria-label={isHe ? pg(`דבר אל ${labels.short}`, `דברי אל ${labels.short}`, `דבר/י אל ${labels.short}`) : `Speak to ${labels.short}`}
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
