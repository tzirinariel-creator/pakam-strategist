import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";

/**
 * Google Calendar OAuth — Disconnect: Revoke token and clear from DB.
 */
export async function POST() {
  const supabase = await createServerSupabase();
  // getUser() verifies the identity with the auth server (getSession only
  // reads the cookie) — this route revokes and deletes a stored token.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The demo account is read-only — never mutate the shared showcase row.
  if (isDemoEmail(authUser.email)) {
    return NextResponse.json({ error: DEMO_READONLY_MESSAGE }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { supabaseId: authUser.id },
    select: { encryptedGoogleToken: true },
  });

  // Attempt to revoke the token at Google (best-effort)
  if (user?.encryptedGoogleToken) {
    try {
      const token = decrypt(user.encryptedGoogleToken);
      const oauth2Client = new google.auth.OAuth2();
      await oauth2Client.revokeToken(token);
    } catch (err) {
      // Token may already be expired/revoked — log and continue
      console.warn("[Google OAuth] Token revocation failed (may be already revoked):", err);
    }
  }

  // Clear tokens from DB regardless
  await prisma.user.update({
    where: { supabaseId: authUser.id },
    data: {
      encryptedGoogleToken: null,
      googleRefreshToken: null,
    },
  });

  return NextResponse.json({ success: true });
}
