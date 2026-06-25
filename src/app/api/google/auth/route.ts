import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { randomBytes } from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";

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
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "he";
    return NextResponse.redirect(new URL(`/${locale}/login`, request.nextUrl.origin));
  }

  // Validate required env vars
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    console.error("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "he";
    return NextResponse.redirect(
      new URL(`/${locale}/settings?google=error`, request.nextUrl.origin),
    );
  }

  // Build redirect URI: prefer env var, fallback to dynamic origin
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${request.nextUrl.origin}/api/google/callback`;

  console.log("[Google OAuth] Auth request:", {
    clientId: process.env.GOOGLE_CLIENT_ID.slice(0, 10) + "...",
    redirectUri,
    origin: request.nextUrl.origin,
  });

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  // CSRF protection: random nonce + userId
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}:${session.user.id}`;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });

  return NextResponse.redirect(authUrl);
}
