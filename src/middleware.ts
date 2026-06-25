import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/about", "/faq", "/privacy", "/terms"];

function isPublicPath(pathname: string): boolean {
  // Allow root locale paths (landing page): /he, /en, /
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return true;

  return PUBLIC_PATHS.some((p) => pathname.includes(p));
}

export async function middleware(request: NextRequest) {
  // 1. Run i18n middleware first (handles locale detection & routing)
  const response = intlMiddleware(request);

  const { pathname } = request.nextUrl;

  // 2. Skip auth check for public paths
  if (isPublicPath(pathname)) {
    return response;
  }

  // 3. Check Supabase session for protected routes
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => {
            for (const { name, value, options } of cookies) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      // Extract locale from the pathname (e.g., /he/dashboard → he)
      const segments = pathname.split("/").filter(Boolean);
      const locale =
        segments[0] && routing.locales.includes(segments[0] as "he" | "en")
          ? segments[0]
          : "he";

      const loginUrl = new URL(`/${locale}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    // If auth check fails, allow through (tRPC will catch unauthorized)
    // This prevents middleware from breaking the entire app
  }

  return response;
}

export const config = {
  // Match all pathnames except those starting with:
  // - api (API routes)
  // - _next (Next.js internals)
  // - _vercel (Vercel internals)
  // - .*\\..*  (files with extensions like .ico, .svg, etc.)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
