import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { randomBytes } from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Google Calendar OAuth — Step 1: Redirect user to Google consent screen.
 * This is separate from Supabase Google login — it requests Calendar-specific scopes.
 *
 * Security:
 * - Verifies Supabase session before starting OAuth
 * - Uses cryptographically random nonce in state parameter
 * - State format: "nonce:userId" — callback validates both parts
 * - Validates all required env vars are present
 */
export async function GET(request: NextRequest) {
  // Verify user is authenticated via Supabase
  const supabase = await createServerSupabase();
  // getUser() verifies the token with Supabase Auth. getSession() only decodes
  // the cookie, and this route is excluded from middleware, so it was the
  // app's only genuinely unverified auth check. The OAuth callback re-verifies
  // and matches the state userId, so no token could be written to another
  // account — but an unauthenticated visitor could still start the flow.
  const {
    data: { user: authedUser },
  } = await supabase.auth.getUser();

  if (!authedUser) {
    const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "he";
    return NextResponse.redirect(new URL(`/${locale}/login`, request.nextUrl.origin));
  }

  // Validate required env vars
  if (
    !env("GOOGLE_CLIENT_ID") ||
    !env("GOOGLE_CLIENT_SECRET")
  ) {
    console.error("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "he";
    return NextResponse.redirect(
      new URL(`/${locale}/settings?google=error`, request.nextUrl.origin),
    );
  }

  // Build redirect URI: prefer env var, fallback to dynamic origin
  // env() חותך רווחים וקצוות. הערך בפרודקשן נשמר עם "\n" בסוף, וגוגל
  // דחתה כל בקשה עם invalid_request — ראו lib/env.ts.
  const redirectUri =
    env("GOOGLE_REDIRECT_URI") ||
    `${request.nextUrl.origin}/api/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    env("GOOGLE_CLIENT_ID"),
    env("GOOGLE_CLIENT_SECRET"),
    redirectUri,
  );

  // CSRF protection: random nonce + userId
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}:${authedUser.id}`;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });

  return NextResponse.redirect(authUrl);
}
