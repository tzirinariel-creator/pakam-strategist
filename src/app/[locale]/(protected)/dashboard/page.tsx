import { setRequestLocale } from "next-intl/server";
import { DashboardContent } from "./dashboard-content";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // No Suspense wrapper here, deliberately — and this is the reason.
  //
  // Ariel, 1.9: "אם אני סטודנט אני סוגר את האפליקציה הזאת מאוד מהר אחרי שאני
  // פותח בה — יש דברים שלא עובדים." Opening the dashboard by URL, which is
  // where every login lands, showed the crown loader and never moved off it.
  //
  // The page used to wrap <DashboardContent /> in a Suspense boundary whose
  // fallback was ThemedLoader. On a direct request the server rendered that
  // fallback into the markup and streamed the real subtree as flight data —
  // and on this route the client never resolved the boundary, so
  // DashboardContent was never mounted at all. Measured rather than guessed:
  // the served HTML contained ONLY the loader outside the script tags, all
  // seven tRPC calls returned 200, every chunk loaded, the console was empty,
  // and the same screen rendered perfectly when reached by client-side
  // navigation. It was the only page in the app with this wrapper.
  //
  // Nothing is lost by removing it. DashboardContent is a client component
  // that already renders its own DashboardSkeleton while the plan query is in
  // flight — a skeleton shaped like the real layout, which is a better loading
  // state than a centred spinner anyway. The boundary was covering a component
  // that never suspends.
  return <DashboardContent />;
}
