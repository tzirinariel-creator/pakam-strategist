import { setRequestLocale } from "next-intl/server";
import { ModerationQueue } from "@/components/admin/moderation-queue";

export default async function AdminModerationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ModerationQueue />;
}
