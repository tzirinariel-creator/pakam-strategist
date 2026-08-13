"use client";

import { MessageSquare, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { CONTACT_EMAIL } from "@/lib/constants";
import { usePathname } from "@/i18n/navigation";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Feedback & install (L1 + L3)
// ---------------------------------------------------------------

export function FeedbackSection() {
  const t = useTranslations("settings");
  const pathname = usePathname();

  // L3 — the feedback channel is a prefilled mail (no tracking, no extra
  // table); the page context rides along so the report lands actionable.
  // Encode the WHOLE body (was raw Hebrew/spaces/slashes in the URL → mangled
  // in many mail clients — audit 22.7).
  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    t("feedbackSubject"),
  )}&body=${encodeURIComponent(`${t("feedbackBody")}${pathname}`)}`;

  return (
    <SectionCard
      icon={MessageSquare}
      title={t("feedbackTitle")}
      description={t("feedbackDesc")}
    >
      <div className="space-y-4">
        <div>
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            <Mail className="size-4" />
            {t("feedbackButton")}
          </a>
          <p className="mt-2 text-xs text-foreground/50">{t("feedbackHint")}</p>
        </div>

        {/* #45 — the install hint used to live HERE, inside the "send us
            feedback" card: a static two-line list shown to every visitor
            regardless of device, including desktop users who cannot install and
            people already running the installed app. It is now its own section
            (InstallAppSection) that asks what the device can actually do, shows
            a real install button when one is possible, and renders nothing when
            there is no install path. The `installIos` / `installAndroid`
            strings are reused there. */}
      </div>
    </SectionCard>
  );
}
