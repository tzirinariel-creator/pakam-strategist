"use client";

import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { api } from "@/lib/trpc/react";

export function DemoBanner() {
  const t = useTranslations("demo");
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;

  const profileQuery = api.user.getProfile.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
    enabled: !!demoEmail, // Only query when demo mode is configured
  });

  const isDemoUser = demoEmail && profileQuery.data?.email === demoEmail;

  if (!isDemoUser) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-foreground/90 px-4 py-1 text-xs font-medium text-background backdrop-blur-sm">
      <Eye className="size-3.5 shrink-0 opacity-70" />
      <span>{t("banner")}</span>
    </div>
  );
}
