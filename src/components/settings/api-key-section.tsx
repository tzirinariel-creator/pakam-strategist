"use client";

import { useState } from "react";
import { Key, Check, Loader2, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
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
        <p className="text-sm text-foreground/60">{t("apiKeyDemoNote")}</p>
      ) : hasKey ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
            <Check className="size-4 text-status-green" />
            <span>{t("apiKeySet")}</span>
            {masked && (
              <code className="rounded bg-foreground/5 px-2 py-0.5 font-mono text-xs">
                {masked}
              </code>
            )}
            {provider && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/70">
                {t("apiKeyProvider")}{" "}
                {provider === "gemini" ? "Google Gemini" : "Anthropic Claude"}
                {provider === "gemini" && (
                  <span className="rounded-full bg-emerald-400/15 px-1.5 text-[10px] font-bold text-status-green">
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
              className="absolute inset-y-0 end-0 flex items-center px-3 text-foreground/60 transition-colors hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {/* #42 — this section used to say the same thing four times: a
              description, ConnectGeminiGuide's 3 steps + privacy block, an
              "apiKeyInfo" paragraph repeating the privacy line word for word,
              and a SECOND collapsed 4-step guide to the same Google page. The
              duplicates are gone; ConnectGeminiGuide above is the single guide
              and carries the (accurate) privacy disclosure. */}
          <p className="text-xs text-foreground/60">{t("apiKeyFreeLimits")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate({ apiKey: keyInput })}
              disabled={!keyInput.trim() || saveMutation.isPending}
              className="self-start"
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
