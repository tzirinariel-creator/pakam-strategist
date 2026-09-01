"use client";

import { useLocale } from "next-intl";
import { usePersona } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";
import { ExternalLink, ShieldCheck, KeyRound, ClipboardPaste, MousePointerClick } from "lucide-react";

/**
 * Step-by-step guide for connecting a FREE Google Gemini key + a plain-words
 * privacy note (what is sent to the AI, how the key is stored, how to leave).
 * Lives in the settings key section; the goal is that a student who has never
 * heard the words "API key" gets through this in two minutes.
 */
export function ConnectGeminiGuide() {
  const isHe = useLocale() === "he";
  // Reflect the chosen advisor persona (one shared store) so the guide names
  // "המלך"/"הרפרנט" instead of a generic advisor (#47).
  // Both step lists are built up-front and one is rendered, so each needs the
  // name in ITS language — not the current locale's.
  const { persona } = usePersona();
  const advisorHe = personaLabels(persona, true).short;
  const advisorEn = personaLabels(persona, false).short;

  const steps = isHe
    ? [
        { icon: ExternalLink, text: <>פותחים את <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-brand underline-offset-2 hover:underline">Google AI Studio</a> ומתחברים עם חשבון הגוגל הרגיל שלכם.</> },
        { icon: MousePointerClick, text: <>לוחצים על <b>Create API key</b>. זהו — לא מבקשים כרטיס אשראי, והשכבה החינמית מספיקה בשפע לשימוש בעוזר.</> },
        { icon: ClipboardPaste, text: <>מעתיקים את המפתח שנוצר ומדביקים אותו בשדה כאן למטה. מרגע זה {advisorHe} עובד עם המכסה האישית שלכם.</> },
      ]
    : [
        { icon: ExternalLink, text: <>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-brand underline-offset-2 hover:underline">Google AI Studio</a> and sign in with your regular Google account.</> },
        { icon: MousePointerClick, text: <>Click <b>Create API key</b>. That&apos;s it — no credit card, and the free tier is plenty for the assistant.</> },
        { icon: ClipboardPaste, text: <>Copy the key and paste it in the field below. From that moment {advisorEn} runs on your own quota.</> },
      ];

  return (
    <div className="space-y-3">
      {/* The 3-step connect guide */}
      <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground/70">
          <KeyRound className="size-3.5 text-accent-brand" />
          {isHe ? "איך משיגים מפתח חינמי? (2 דקות)" : "How to get a free key (2 minutes)"}
        </p>
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/70">
                <span className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full bg-accent-brand/10 text-[10px] font-bold text-accent-brand">
                  {i + 1}
                </span>
                <Icon className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
                <span>{s.text}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[11px] leading-snug text-foreground/60">
          {isHe
            ? "אין לכם מפתח? העוזר עדיין עובד דרך המפתח המשותף החינמי של האפליקציה (עם מכסה יומית משותפת). מפתח אישי פשוט נותן לכם מכסה משלכם."
            : "No key? The assistant still works through the app's shared free key (with a shared daily quota). A personal key simply gives you your own quota."}
        </p>
      </div>

      {/* Privacy, in plain words */}
      <div className="rounded-xl border border-border/60 bg-foreground/[0.02] p-3.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground/70">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          {isHe ? "מה נשלח ולאן? (פרטיות בגובה העיניים)" : "What gets sent where? (privacy, plainly)"}
        </p>
        <ul className="space-y-1 text-[11px] leading-relaxed text-foreground/60">
          <li>
            {isHe
              ? "כששואלים את העוזר, נשלחים ל-Google Gemini: השאלה שלכם + תמצית נתוני-התואר שלכם (ש״ס, ממוצע, קורסים, דרישות) — כדי שהתשובה תהיה אישית."
              : "When you ask the assistant, your question + a summary of your degree data (credits, average, courses, requirements) is sent to Google Gemini — so the answer is personal."}
          </li>
          <li>
            {isHe
              ? "המפתח שלכם נשמר אצלנו מוצפן, משמש רק לשיחות שלכם, ואפשר להסיר אותו כאן בכל רגע."
              : "Your key is stored encrypted, used only for your own chats, and can be removed here at any moment."}
          </li>
          <li>
            {isHe
              ? "שום דבר לא נשלח לאף גורם אחר, והנתונים לא משמשים לפרסום. בלי מפתח ובלי שימוש בעוזר — שום דבר לא יוצא מהאפליקציה."
              : "Nothing is sent to any other party, and the data isn't used for ads. Without a key and without using the assistant — nothing leaves the app."}
          </li>
        </ul>
      </div>
    </div>
  );
}
