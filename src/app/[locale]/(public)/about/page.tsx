"use client";

import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">
          {t("title")}
        </h1>
        <p className="text-lg text-muted-foreground">{t("heroLine")}</p>
      </div>

      <div className="space-y-4 text-sm leading-relaxed text-foreground/80">
        <p>{t("story1")}</p>
        <p>{t("story2")}</p>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-lg text-foreground">
          {t("whatIsTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("whatIs")}
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-lg text-foreground">
          {t("notTitle")}
        </h2>
        <ul className="space-y-2 text-sm text-foreground/80">
          <li className="flex items-start gap-2">
            <span className="mt-1 block size-1.5 shrink-0 rounded-full bg-foreground/30" />
            {t("notList1")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 block size-1.5 shrink-0 rounded-full bg-foreground/30" />
            {t("notList2")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 block size-1.5 shrink-0 rounded-full bg-foreground/30" />
            {t("notList3")}
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5">
        <p className="mb-2 text-sm text-foreground/70">{t("contact")}</p>
        <a
          href="mailto:ariel@pakamon.app"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/70"
        >
          <Mail className="size-4" />
          ariel@pakamon.app
        </a>
      </div>
    </div>
  );
}
