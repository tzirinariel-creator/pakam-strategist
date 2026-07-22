"use client";

import { MessageSquare, Smartphone, Mail } from "lucide-react";
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

        {/* L1 — install hint: the app is a PWA; surface the two magic paths */}
        <div className="rounded-lg border border-border/50 bg-foreground/[0.03] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground/80">
            <Smartphone className="size-4" />
            {t("installTitle")}
          </p>
          <ul className="space-y-1 text-xs leading-relaxed text-foreground/60">
            <li>{t("installIos")}</li>
            <li>{t("installAndroid")}</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
