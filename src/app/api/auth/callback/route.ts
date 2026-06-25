import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase OAuth callback handler.
 * After Google OAuth consent, Supabase redirects here with a `code` parameter.
 * We exchange the code for a session and redirect to the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Validate redirect target to prevent open-redirect attacks.
  // Only allow relative paths that start with "/" and don't contain "//"
  // (which could be used to redirect to an external site like "//evil.com").
  const rawNext = searchParams.get("next") ?? "/he/planner";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/he/planner";

  if (code) {
    const response = NextResponse.redirect(new URL(next, origin));

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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }
  }

  // Something went wrong — redirect to login with error.
  // Extract locale from the next param (e.g., "/he/dashboard" → "he") or default to "he".
  const localeMatch = next.match(/^\/([a-z]{2})\//);
  const errorLocale = localeMatch?.[1] ?? "he";
  return NextResponse.redirect(new URL(`/${errorLocale}/login?error=auth`, origin));
}
