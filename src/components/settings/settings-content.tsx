"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProfileSection } from "./profile-section";
import { MiluimLinkCard } from "./miluim-link-card";
import { ApiKeySection } from "./api-key-section";
import { CohortWisdomSection } from "./cohort-wisdom-section";
import { PersonaSection } from "./persona-section";
import { GoogleCalendarSection } from "./google-calendar-section";
import { AppearanceSection } from "./appearance-section";
import { FeedbackSection } from "./feedback-section";
import { AccountSection } from "./account-section";

// ---------------------------------------------------------------
// Main Settings Content
// ---------------------------------------------------------------

export function SettingsContent() {
  const t = useTranslations("settings");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="size-8 text-foreground/80" />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-2xl font-bold text-foreground/80 md:text-3xl">
            {t("title")}
          </h1>
          <p className="text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
      </div>

      {/* Settings sections */}
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ProfileSection />
        <MiluimLinkCard />
        <ApiKeySection />
        <CohortWisdomSection />
        <PersonaSection />
        <GoogleCalendarSection />
        <AppearanceSection />
        <FeedbackSection />
        <AccountSection />
      </div>
    </div>
  );
}
