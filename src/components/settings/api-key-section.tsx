"use client";

import { useState } from "react";
import { Key, Check, Loader2, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { ConnectGeminiGuide } from "@/components/settings/connect-gemini-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// API Key Section (Claude BYOK)
// ---------------------------------------------------------------

export function ApiKeySection() {
  const t = useTranslations("settings");
  const isHe = useLocale() === "he";
  const utils = api.useUtils();
  const profileQuery = api.user.getProfile.useQuery();
  const keyQuery = api.ai.hasApiKey.useQuery();

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  const isDemoUser = Boolean(
    demoEmail && profileQuery.data?.email === demoEmail
  );

  const saveMutation = api.ai.saveApiKey.useMutation({
    onSuccess: () => {
      setKeyInput("");
      setShowKey(false);
      void utils.ai.hasApiKey.invalidate();
      toast.success(t("apiKeySaved"));
    },
    onError: (err) => {
      // The backend returns a specific message for an invalid key format.
      toast.error(err.message || t("apiKeySaveError"));
    },
  });

  const removeMutation = api.ai.removeApiKey.useMutation({
    onSuccess: () => {
      void utils.ai.hasApiKey.invalidate();
      toast.success(t("apiKeyRemoved"));
    },
    onError: () => {
      toast.error(t("apiKeyRemoveError"));
    },
  });

  const hasKey = keyQuery.data?.hasKey ?? false;
  const masked = keyQuery.data?.masked ?? null;
  const provider = keyQuery.data?.provider ?? null;

  return (
    <SectionCard
      icon={Key}
      title={t("apiKey")}
      description={t("apiKeyDescription")}
    >
      {isDemoUser ? (
        <p className="text-sm text-foreground/50">{t("apiKeyDemoNote")}</p>
      ) : hasKey ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
            <Check className="size-4 text-emerald-500" />
            <span>{t("apiKeySet")}</span>
            {masked && (
              <code className="rounded bg-foreground/5 px-2 py-0.5 font-mono text-xs">
                {masked}
              </code>
            )}
            {provider && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/60">
                {t("apiKeyProvider")}{" "}
                {provider === "gemini" ? "Google Gemini" : "Anthropic Claude"}
                {provider === "gemini" && (
                  <span className="rounded-full bg-emerald-400/15 px-1.5 text-[10px] font-bold text-emerald-600">
                    {t("apiKeyFreeBadge")}
                  </span>
                )}
              </span>
            )}
          </div>
          <Button
            variant="destructive"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="self-start"
          >
            {removeMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t("removeApiKey")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Guided onboarding + plain-words privacy — a student who never
              heard "API key" should get through this in two minutes. */}
          <ConnectGeminiGuide />
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t("enterApiKey")}
              autoComplete="off"
              spellCheck={false}
              className="pe-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute inset-y-0 end-0 flex items-center px-3 text-foreground/50 transition-colors hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-foreground/50">{t("apiKeyInfo")}</p>
          <p className="text-xs text-foreground/40">{t("apiKeyFreeLimits")}</p>
          <details className="rounded-lg border border-border/50 bg-foreground/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground/70">
              {isHe ? "מה זה בכלל מפתח, ואיך משיגים אחד? מדריך של דקה" : "What's a key and how do I get one? 1-minute guide"}
            </summary>
            <div className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-foreground/65">
              <p>
                {isHe
                  ? "מפתח הוא כמו כרטיס-כניסה אישי ל-AI של גוגל — חינמי לגמרי, בלי כרטיס אשראי. הוא נראה כמו שורת אותיות ומספרים ארוכה. ככה משיגים:"
                  : "A key is a personal, completely free entry ticket to Google's AI (no credit card). It looks like a long string of letters and numbers. Here's how:"}
              </p>
              <ol className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">1</span>
                  <span>
                    {isHe ? <>נכנסים ל-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-brand hover:underline">aistudio.google.com/apikey</a> ומתחברים עם חשבון הגוגל הרגיל שלכם.</> : <>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-brand hover:underline">aistudio.google.com/apikey</a> and sign in with your regular Google account.</>}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">2</span>
                  <span className="min-w-0 flex-1">
                    {isHe ? "מחפשים את הכפתור הכחול הזה ולוחצים עליו:" : "Find and click this blue button:"}
                    <span dir="ltr" className="mt-1 flex w-fit items-center gap-1.5 rounded-md bg-[#1a73e8] px-3 py-1.5 text-[11px] font-medium text-white shadow-sm">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      Create API key
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">3</span>
                  <span className="min-w-0 flex-1">
                    {isHe ? "נוצרת שורה ארוכה שמתחילה ב-AIza. לוחצים על אייקון-ההעתקה שלידה:" : "A long string starting with AIza appears. Click the copy icon beside it:"}
                    <span dir="ltr" className="mt-1 flex w-fit items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground/60">
                      AIzaSy••••••••••••••••
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-brand/15 text-[10px] font-bold text-accent-brand">4</span>
                  <span>
                    {isHe ? "מדביקים בשדה כאן למעלה ולוחצים שמירה. זהו — מהרגע הזה המלך עובד על המכסה הפרטית שלכם." : "Paste it in the field above and hit save. Done — the King now runs on your private quota."}
                  </span>
                </li>
              </ol>
              <p className="text-[11px] text-foreground/40">
                {isHe
                  ? "המפתח נשמר אצלנו מוצפן, ואפשר למחוק אותו מכאן בכל רגע. אם משהו לא מסתדר — פשוט תמשיכו על המכסה המשותפת, זה בסדר גמור."
                  : "The key is stored encrypted and can be removed here anytime. If anything's confusing — just keep using the shared quota, that's perfectly fine."}
              </p>
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate({ apiKey: keyInput })}
              disabled={!keyInput.trim() || saveMutation.isPending}
              className="self-start bg-foreground text-background hover:bg-foreground/90"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Key className="size-4" />
              )}
              {t("saveApiKey")}
            </Button>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-brand transition-colors hover:text-accent-brand-hover"
            >
              <ExternalLink className="size-3.5" />
              {t("getApiKey")}
            </a>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
