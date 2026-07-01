import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppProviders } from "@/components/providers/app-providers";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ProtectedShell } from "@/components/layout/protected-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { MiluimStatusBar } from "@/components/layout/miluim-status-bar";
import { BannerStack } from "@/components/layout/banner-stack";

/**
 * Protected layout — wraps all authenticated pages.
 *
 * Defense-in-depth: middleware already redirects unauthenticated users,
 * but we verify the session here too.  If middleware fails (crash, CDN
 * cache, Supabase outage), this server-side check ensures no protected
 * page renders without a valid session.
 */
export default async function ProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Server-side auth guard (defense-in-depth alongside middleware).
  // Use getUser() — it revalidates the token against Supabase Auth rather
  // than trusting the cookie-decoded session (which is spoofable). This
  // matches the tRPC context's getUser()-based authorization.
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/${locale}/login`);
    }
  } catch (e) {
    // redirect() throws a special Next.js error — let it propagate
    if (e && typeof e === "object" && "digest" in e) throw e;
    // For real errors (Supabase down, etc.), redirect to login rather
    // than serving protected content to an unauthenticated visitor.
    redirect("/he/login");
  }

  return (
    <AppProviders>
      {/* Top notification bars as one sticky unit — publishes --banner-offset so
          the fixed sidebar/top-bar sit *below* them instead of being covered (#7). */}
      <BannerStack>
        {/* Demo mode banner */}
        <DemoBanner />
        {/* Persistent miluim status bar — always visible for serving students */}
        <MiluimStatusBar />
      </BannerStack>

      <div className="min-h-screen">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Top bar */}
        <TopBar />

        {/* Main content */}
        <ProtectedShell>{children}</ProtectedShell>

        {/* Mobile bottom nav */}
        <MobileNav />
      </div>
    </AppProviders>
  );
}
