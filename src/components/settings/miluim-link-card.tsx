"use client";

import { Shield } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionCard } from "./section-card";

// המילואים קיבלו עמוד משלהם (12.7 #18/#32) — ההגדרות מפנות אליו.
export function MiluimLinkCard() {
  const locale = useLocale();
  const isHe = locale === "he";
  return (
    <SectionCard
      icon={Shield}
      title={isHe ? "מילואים" : "Miluim (reserve duty)"}
      description={isHe ? "הזכויות, הקבוצה, טופס 3010 והמעקב — בעמוד ייעודי" : "Rights, group, Form 3010 and tracking — on a dedicated page"}
    >
      <Link
        href="/miluim"
        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/8 px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/15"
      >
        <Shield className="size-4" />
        {isHe ? "לעמוד המילואים" : "Open the Miluim page"}
      </Link>
    </SectionCard>
  );
}
