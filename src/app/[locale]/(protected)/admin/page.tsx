import { setRequestLocale } from "next-intl/server";
import { AdminOverview } from "@/components/admin/admin-overview";

/**
 * /admin — the back office's front door.
 *
 * Until now this path was a 404: the admin area had two leaf pages (sync,
 * moderation) reachable only from the sidebar, and the obvious URL led
 * nowhere. The gate is the parent layout (role === "admin" → redirect) plus
 * `adminProcedure` on the data itself.
 */
export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminOverview />;
}
