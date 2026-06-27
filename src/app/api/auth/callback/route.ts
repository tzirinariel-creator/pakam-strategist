import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";

/**
 * Supabase auth callback handler.
 * Handles two flows that both land here:
 *  1. OAuth / PKCE — Supabase redirects with a `code` parameter (Google sign-in).
 *  2. Email confirmation — the signup confirm link carries `token_hash` + `type`
 *     (e.g. type=signup). We verify the OTP to establish the session.
 * In both cases we exchange the credential for a session and redirect to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Validate redirect target to prevent open-redirect attacks.
  // Only allow relative paths that start with "/" and don't contain "//"
  // (which could be used to redirect to an external site like "//evil.com").
  const rawNext = searchParams.get("next") ?? "/he/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/he/dashboard";

  if (code || (tokenHash && type)) {
    const response = NextResponse.redirect(new URL(next, origin));

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

    // PKCE / OAuth flow → exchange code; email-confirm flow → verify OTP.
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });

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
