"use client";

import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/constants";

export default function PrivacyPage() {
  const t = useTranslations("privacy");

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

      <Section title={t("collectTitle")}>
        <BulletList
          items={[t("collect1"), t("collect2"), t("collect3"), t("collect4")]}
        />
      </Section>

      <Section title={t("dontCollectTitle")}>
        <BulletList
          items={[
            t("dontCollect1"),
            t("dontCollect2"),
            t("dontCollect3"),
          ]}
        />
      </Section>

      <Section title={t("storageTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("storage")}
        </p>
      </Section>

      <Section title={t("googleTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("google")}
        </p>
      </Section>

      {/* SEC2 — reflect reality: what goes to Gemini and when, and how the
          anonymous cohort contributions work. Wording pending owner approval. */}
      <Section title={t("aiTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">{t("ai")}</p>
      </Section>

      <Section title={t("cohortTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">{t("cohort")}</p>
      </Section>

      <Section title={t("deleteTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("delete")}
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
