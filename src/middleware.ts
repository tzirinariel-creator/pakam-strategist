import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase/env";

const intlMiddleware = createIntlMiddleware(routing);

// First post-locale path segments that don't require authentication.
// Matched EXACTLY against the segment (not substring), so a future protected
// route like /he/privacy-settings does NOT slip through as "privacy".
const PUBLIC_SEGMENTS = new Set([
  "login",
  "signup",
  "auth",
  "about",
  "faq",
  "privacy",
  "terms",
]);

function isPublicPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  // Allow root locale paths (landing page): /he, /en, /
  if (segments.length <= 1) return true;

  // segments[0] is the locale prefix (e.g. "he"); the route segment follows it.
  const firstSegment = routing.locales.includes(segments[0] as "he" | "en")
    ? segments[1]
    : segments[0];

  return firstSegment !== undefined && PUBLIC_SEGMENTS.has(firstSegment);
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
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
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
