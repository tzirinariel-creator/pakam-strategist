"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Smartphone, Share, SquarePlus, Check } from "lucide-react";
import { SectionCard } from "./section-card";
import { Button } from "@/components/ui/button";
import {
  detectInstallPlatform,
  shouldOfferInstall,
  type InstallPlatform,
} from "@/lib/install-app";

/** The Chromium install prompt — not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * #45 — "אפ-סטור? או לפחות המלצה מסודרת להוספה למסך-הבית".
 *
 * A settings SECTION, not a floating nag: the recommendation is there when the
 * student goes looking, and never interrupts bidding week. What it says depends
 * on what the device can actually do (see lib/install-app.ts) — on iOS Safari
 * there is no install API at all, so the honest answer is the two-step
 * instruction, not a button that would do nothing.
 */
export function InstallAppSection() {
  const isHe = useLocale() === "he";
  // Reuses the copy that already existed (and was already translated) inside
  // the Feedback card — see the note on that card's removal.
  const t = useTranslations("settings");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [installed, setInstalled] = useState(false);

  const resolve = useCallback((hasPromptEvent: boolean) => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's own flag — it does not implement display-mode: standalone
      // for home-screen launches on every version.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setPlatform(
      detectInstallPlatform(
        { userAgent: navigator.userAgent, isStandalone: standalone, hasPromptEvent },
        navigator.maxTouchPoints,
      ),
    );
  }, []);

  useEffect(() => {
    resolve(false);

    const onBeforeInstall = (e: Event) => {
      // Keep the event so the button can fire the REAL prompt later; Chrome
      // only hands it over once, and only when it deems the app installable.
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      resolve(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [resolve]);

  // Server render + the first client pass agree on null, so nothing flashes.
  if (platform === null) return null;
  if (!installed && !shouldOfferInstall(platform)) return null;

  const title = isHe ? "פכמון על מסך הבית" : "Pakamon on your home screen";
  const description = isHe
    ? "פותחים כמו אפליקציה — בלי שורת הכתובת, עם אייקון משלה."
    : "Opens like an app — no address bar, with its own icon.";

  return (
    <SectionCard icon={Smartphone} title={title} description={description}>
      {installed ? (
        <p className="flex items-center gap-2 text-sm text-foreground/60">
          <Check className="size-4 shrink-0 text-accent-brand" />
          {isHe ? "מותקן. אפשר לפתוח אותה ממסך הבית." : "Installed — open it from your home screen."}
        </p>
      ) : platform === "prompt-capable" ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm leading-relaxed text-foreground/60">
            {isHe
              ? "המערכת שלכם, המבחנים והתכנון — במרחק נגיעה אחת, גם כשהרשת חלשה בקמפוס."
              : "Your timetable, exams and plan one tap away — even on a weak campus signal."}
          </p>
          <Button
            type="button"
            onClick={async () => {
              if (!promptEvent) return;
              await promptEvent.prompt();
              const { outcome } = await promptEvent.userChoice;
              // The event is single-use: once shown, Chrome will not give it back.
              setPromptEvent(null);
              if (outcome === "accepted") setInstalled(true);
              else resolve(false);
            }}
          >
            {isHe ? "התקינו את פכמון" : "Install Pakamon"}
          </Button>
        </div>
      ) : platform === "android-manual" ? (
        // Android without a prompt event — the browser menu still installs.
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-brand-muted text-accent-brand">
            <SquarePlus className="size-3.5" />
          </span>
          <p className="text-sm leading-relaxed text-foreground/70">{t("installAndroid")}</p>
        </div>
      ) : (
        // iOS Safari — no install API exists. Instructions, not a fake button.
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-foreground/60">
            {isHe
              ? "בספארי באייפון ההוספה היא ידנית — שני צעדים:"
              : "On iPhone Safari this is manual — two steps:"}
          </p>
          <ol className="flex flex-col gap-2.5">
            <li className="flex items-start gap-2.5 text-sm text-foreground/70">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-brand-muted text-accent-brand">
                <Share className="size-3.5" />
              </span>
              <span>
                {isHe
                  ? "מקישים על כפתור השיתוף בסרגל התחתון של ספארי."
                  : "Tap the Share button in Safari's bottom bar."}
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-foreground/70">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-brand-muted text-accent-brand">
                <SquarePlus className="size-3.5" />
              </span>
              <span>
                {isHe ? 'בוחרים "הוספה למסך הבית".' : 'Choose "Add to Home Screen".'}
              </span>
            </li>
          </ol>
        </div>
      )}
    </SectionCard>
  );
}
