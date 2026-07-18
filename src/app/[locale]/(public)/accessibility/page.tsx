"use client";

import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/constants";

/* SEC3 — accessibility statement. Wording pending owner approval (legal-ish
   public commitment); the technical claims reflect the actual axe sweep. */
export default function AccessibilityPage() {
  const t = useTranslations("accessibility");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
      </div>

      <p className="text-sm leading-relaxed text-foreground/80">
        {t("intro")}
      </p>

      <Section title={t("doneTitle")}>
        <BulletList
          items={[t("done1"), t("done2"), t("done3"), t("done4")]}
        />
      </Section>

      <Section title={t("limitsTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("limits")}
        </p>
      </Section>

      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h3 className="mb-2 font-semibold text-foreground">
          {t("contactTitle")}
        </h3>
        <p className="mb-2 text-sm text-foreground/70">{t("contact")}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/70"
        >
          <Mail className="size-4" />
          {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-lg text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm text-foreground/80">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1 block size-1.5 shrink-0 rounded-full bg-foreground/30" />
          {item}
        </li>
      ))}
    </ul>
  );
}
