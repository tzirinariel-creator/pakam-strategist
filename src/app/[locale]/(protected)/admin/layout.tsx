import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

/**
 * Admin layout — ensures only admin users can access /admin routes.
 * Sits inside the protected layout (so auth is already verified).
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  // Check admin role in DB
  try {
    const user = await prisma.user.findUnique({
      where: { supabaseId: session.user.id },
      select: { role: true },
    });

    if (!user || user.role !== "admin") {
      // Not an admin — redirect to dashboard
      redirect(`/${locale}/dashboard`);
    }
  } catch {
    // DB error — redirect to dashboard as fallback
    redirect(`/${locale}/dashboard`);
  }

  return <>{children}</>;
}
