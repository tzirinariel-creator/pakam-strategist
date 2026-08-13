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
  // getUser(), not getSession(): getSession only reads storage and checks the
  // expiry claim — it never verifies the JWT signature, so a forged cookie
  // satisfies it. This is an admin gate; it must verify against Supabase Auth.
  // (Defence in depth either way — the parent (protected)/layout.tsx already
  // uses getUser and the data comes from adminProcedure — but the codebase's
  // own rule is getUser for authorization, and this file broke it.)
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect(`/${locale}/login`);
  }

  // Check admin role in DB
  try {
    const user = await prisma.user.findUnique({
      where: { supabaseId: authUser.id },
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
