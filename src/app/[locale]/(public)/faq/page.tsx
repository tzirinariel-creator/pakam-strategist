"use client";

import { useTranslations } from "next-intl";

const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const;

export default function FaqPage() {
  const t = useTranslations("faq");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-6">
        {FAQ_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-xl border border-border/60 bg-card p-5"
          >
            <h3 className="mb-2 font-semibold text-foreground">
              {t(key)}
            </h3>
            <p className="text-sm leading-relaxed text-foreground/70">
              {t(`a${key.slice(1)}` as `a${string}`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
