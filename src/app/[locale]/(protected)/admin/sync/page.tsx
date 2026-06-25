import { setRequestLocale } from "next-intl/server";
import { SyncDashboard } from "@/components/admin/sync-dashboard";

export default async function AdminSyncPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SyncDashboard />;
}
