import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

/**
 * Google Calendar OAuth — Step 2: Exchange authorization code for tokens.
 * Encrypts and stores tokens in the database.
 *
 * Security:
 * - Validates state parameter format (nonce:userId)
 * - Verifies logged-in user matches state userId (CSRF protection)
 * - Encrypts tokens with AES-256-GCM before storage
 * - Logs errors without leaking sensitive info to client
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Detect user locale from cookie for redirects
  const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "he";
  const settingsUrl = (query: string) =>
    new URL(`/${locale}/settings?${query}`, origin);

  // User denied access
  if (error) {
    return NextResponse.redirect(settingsUrl("google=denied"));
  }

  if (!code || !state) {
    return NextResponse.redirect(settingsUrl("google=error"));
  }

  // Parse state: format is "nonce:userId"
  const colonIndex = state.lastIndexOf(":");
  const userId = colonIndex > 0
    ? state.slice(colonIndex + 1)
    : state;

  if (!userId) {
    return NextResponse.redirect(settingsUrl("google=error"));
  }

  // Verify the logged-in user matches the state parameter (CSRF protection)
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.error("[Google OAuth] No active session during callback");
    return NextResponse.redirect(settingsUrl("google=error&reason=no_session"));
  }

  if (session.user.id !== userId) {
    console.error("[Google OAuth] User ID mismatch — possible CSRF attempt");
    return NextResponse.redirect(settingsUrl("google=error&reason=mismatch"));
  }

  try {
    // Build redirect URI: must match exactly what was used in auth route
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${origin}/api/google/callback`;

    // Exchange authorization code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      console.error("[Google OAuth] No access_token received from Google");
      return NextResponse.redirect(settingsUrl("google=error"));
    }

    // Encrypt tokens before storing in DB
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : undefined;

    // Store encrypted tokens
    await prisma.user.update({
      where: { supabaseId: userId },
      data: {
        encryptedGoogleToken: encryptedAccessToken,
        ...(encryptedRefreshToken && {
          googleRefreshToken: encryptedRefreshToken,
        }),
      },
    });

    // Redirect to settings with success indicator
    return NextResponse.redirect(settingsUrl("google=connected"));
  } catch (err) {
    console.error("[Google OAuth] Callback error:", err);
    return NextResponse.redirect(settingsUrl("google=error"));
  }
}
