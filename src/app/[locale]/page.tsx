import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Check auth — if logged in, go straight to dashboard
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  // Show landing page for unauthenticated users
  return <LandingPage />;
}
