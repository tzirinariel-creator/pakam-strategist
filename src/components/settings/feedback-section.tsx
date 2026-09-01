"use client";

import { useState } from "react";
import { MessageSquare, Mail, Copy, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CONTACT_EMAIL } from "@/lib/constants";
import { usePathname } from "@/i18n/navigation";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Feedback & install (L1 + L3)
// ---------------------------------------------------------------

export function FeedbackSection() {
  const t = useTranslations("settings");
  const isHe = useLocale() === "he";
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);

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
          {/* Ariel, 21.8: "החלון משוב לא עובד".
              It was a bare mailto:. On a machine with no mail client bound to
              the protocol — a browser-only setup, which is most people — the
              click does nothing at all: no error, no new window, nothing. A
              button whose entire failure mode is silence is indistinguishable
              from a broken one, and he had no way to tell which it was.
              The address is now visible and copyable, so the mail link is a
              convenience rather than the only route. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Ariel, 1.9: "לוחצים על דיווח על בעיה או רעיון וזה לא עושה כלום.
                בוא פשוט נשאיר את המייל."
                The copy-address escape hatch beside this was added in August
                and he still hit the wall, because the PRIMARY control was a
                label that says nothing about where it goes. So the address is
                now the label: a click that silently fails still leaves the one
                thing he asked for on the screen, in front of him, readable. */}
            <a
              href={mailtoHref}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              <Mail className="size-4" />
              <span className="font-data" dir="ltr">{CONTACT_EMAIL}</span>
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(CONTACT_EMAIL);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard blocked — the address is on screen anyway */
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground/70 transition-colors hover:border-foreground/30"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied
                ? isHe ? "הועתק" : "Copied"
                : isHe ? "העתקת הכתובת" : "Copy address"}
            </button>
          </div>
          <p className="mt-2 text-xs text-foreground/60">
            {isHe
              ? "זו הכתובת — אפשר להעתיק אותה ולכתוב מכל מקום."
              : "That's the address — copy it and write from anywhere."}
          </p>
          <p className="mt-1 text-xs text-foreground/60">{t("feedbackHint")}</p>
          {/* Ariel, 21.8: "נזכיר שאני סטודנט שעושה את זה בשביל הכיף ובשביל
              לעזור". Worth saying out loud — it sets the right expectation
              (there is no support desk) and it makes people write to a person
              rather than to a form. */}
          <p className="mt-2 rounded-lg bg-foreground/[0.03] p-2.5 text-xs leading-relaxed text-foreground/60">
            {t("feedbackWhoAmI")}
          </p>
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
