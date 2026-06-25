// =========================================
// Google Calendar API Service
// Server-side only — never import in client code
// =========================================

import { google, type calendar_v3 } from "googleapis";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

// ─── Client Factory ─────────────────────────────────────────

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function createGoogleCalendarClient(
  accessToken: string,
  refreshToken?: string | null,
): calendar_v3.Calendar {
  const oauth2Client = createOAuth2Client();

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

// ─── Token Helpers ──────────────────────────────────────────

export async function getDecryptedTokens(supabaseId: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
} | null> {
  const user = await prisma.user.findUnique({
    where: { supabaseId },
    select: { encryptedGoogleToken: true, googleRefreshToken: true },
  });

  if (!user?.encryptedGoogleToken) return null;

  try {
    return {
      accessToken: decrypt(user.encryptedGoogleToken),
      refreshToken: user.googleRefreshToken
        ? decrypt(user.googleRefreshToken)
        : null,
    };
  } catch {
    // Decryption failed — tokens are corrupted
    return null;
  }
}

// ─── Token Refresh Wrapper ──────────────────────────────────

/**
 * Execute a Google Calendar operation with automatic token refresh on 401.
 * If the access token is expired, uses the refresh token to get a new one,
 * saves it to the DB, and retries the operation.
 */
export async function withTokenRefresh<T>(
  supabaseId: string,
  operation: (calendar: calendar_v3.Calendar) => Promise<T>,
): Promise<T> {
  const tokens = await getDecryptedTokens(supabaseId);
  if (!tokens) {
    throw new Error("No Google Calendar tokens found");
  }

  const calendar = createGoogleCalendarClient(
    tokens.accessToken,
    tokens.refreshToken,
  );

  try {
    return await operation(calendar);
  } catch (err: unknown) {
    const isAuthError =
      err instanceof Error &&
      "code" in err &&
      (err as { code: number }).code === 401;

    if (isAuthError && tokens.refreshToken) {
      // Refresh the access token
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        refresh_token: tokens.refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      if (credentials.access_token) {
        // Save new access token to DB
        await prisma.user.update({
          where: { supabaseId },
          data: {
            encryptedGoogleToken: encrypt(credentials.access_token),
          },
        });

        // Retry with new token
        const newCalendar = createGoogleCalendarClient(
          credentials.access_token,
          tokens.refreshToken,
        );
        return await operation(newCalendar);
      }
    }

    throw err;
  }
}

// ─── Push Events to Google ──────────────────────────────────

export interface PushableEvent {
  id: string; // local ID (CalendarEvent.id or UserCourse.id)
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  googleEventId?: string | null; // existing Google event ID for updates
  recurrence?: string; // RRULE string
}

/**
 * Push events to Google Calendar (create or update).
 * Returns a map of localId -> googleEventId.
 */
export async function pushEventsToGoogle(
  calendar: calendar_v3.Calendar,
  events: PushableEvent[],
  calendarId = "primary",
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();

  for (const event of events) {
    const resource: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: "Asia/Jerusalem",
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: "Asia/Jerusalem",
      },
    };

    if (event.recurrence) {
      resource.recurrence = [event.recurrence];
    }

    try {
      if (event.googleEventId) {
        // Update existing event
        const res = await calendar.events.update({
          calendarId,
          eventId: event.googleEventId,
          requestBody: resource,
        });
        if (res.data.id) idMap.set(event.id, res.data.id);
      } else {
        // Create new event
        const res = await calendar.events.insert({
          calendarId,
          requestBody: resource,
        });
        if (res.data.id) idMap.set(event.id, res.data.id);
      }
    } catch (err) {
      // Continue with other events — don't let one failure block all
      console.error(`Failed to sync event "${event.title}":`, err);
    }
  }

  return idMap;
}

// ─── Delete Events from Google ──────────────────────────────

/**
 * Delete events from Google Calendar by their Google event IDs.
 * Returns the count of successfully deleted events.
 */
export async function deleteEventsFromGoogle(
  calendar: calendar_v3.Calendar,
  googleEventIds: string[],
  calendarId = "primary",
): Promise<number> {
  let deleted = 0;

  for (const eventId of googleEventIds) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId,
      });
      deleted++;
    } catch (err) {
      // Event may already be deleted or inaccessible — continue
      console.error(`Failed to delete Google event "${eventId}":`, err);
    }
  }

  return deleted;
}

// ─── Pull Events from Google ────────────────────────────────

/**
 * Pull events from Google Calendar.
 * Defaults to 6 months ahead from now.
 */
export async function pullEventsFromGoogle(
  calendar: calendar_v3.Calendar,
  calendarId = "primary",
  timeMin?: Date,
  timeMax?: Date,
): Promise<calendar_v3.Schema$Event[]> {
  const now = new Date();

  const response = await calendar.events.list({
    calendarId,
    timeMin: (timeMin ?? now).toISOString(),
    timeMax: (
      timeMax ?? new Date(now.getFullYear(), now.getMonth() + 6, now.getDate())
    ).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 500,
  });

  return response.data.items ?? [];
}
