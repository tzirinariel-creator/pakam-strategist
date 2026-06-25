"use client";

import { useTranslations } from "next-intl";

export default function TermsPage() {
  const t = useTranslations("terms");

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

      <Section title={t("useTitle")}>
        <BulletList items={[t("use1"), t("use2"), t("use3")]} />
      </Section>

      <Section title={t("dontTitle")}>
        <BulletList items={[t("dont1"), t("dont2"), t("dont3")]} />
      </Section>

      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
        <h3 className="mb-2 font-semibold text-foreground">
          {t("disclaimerTitle")}
        </h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("disclaimer")}
        </p>
      </div>

      <Section title={t("changesTitle")}>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t("changes")}
        </p>
      </Section>
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
