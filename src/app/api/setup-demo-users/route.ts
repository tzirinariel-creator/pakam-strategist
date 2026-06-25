import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/setup-demo-users
 *
 * Creates or updates the demo and test users in Supabase Auth.
 * Uses the service_role key (Admin REST API) so it can create users directly.
 * Calls the Supabase GoTrue REST API directly to bypass JS client email validation.
 *
 * Protected by a simple bearer token (SETUP_SECRET env var).
 *
 * Usage:
 *   curl -X POST https://pakam-strategist.vercel.app/api/setup-demo-users \
 *     -H "Authorization: Bearer <SETUP_SECRET>"
 */

const USERS = [
  {
    email: (process.env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "demo@pakamon.dev").trim(),
    password: (process.env.DEMO_USER_PASSWORD ?? "demo123456").trim(),
    label: "demo",
  },
  {
    email: (process.env.NEXT_PUBLIC_TEST_USER_EMAIL ?? "test@pakamon.dev").trim(),
    password: (process.env.TEST_USER_PASSWORD ?? "test123456").trim(),
    label: "test",
  },
];

// ── Helpers for Supabase Admin REST API ──

async function supabaseAdminFetch(
  url: string,
  serviceRoleKey: string,
  options: RequestInit = {}
) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

async function listUsers(supabaseUrl: string, serviceRoleKey: string) {
  const res = await supabaseAdminFetch(
    `${supabaseUrl}/auth/v1/admin/users?per_page=500`,
    serviceRoleKey
  );
  if (!res.ok) return { users: [], error: await res.text() };
  const data = await res.json();
  return { users: data.users ?? [], error: null };
}

async function createUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
  password: string
) {
  const res = await supabaseAdminFetch(
    `${supabaseUrl}/auth/v1/admin/users`,
    serviceRoleKey,
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) return { user: null, error: data.msg ?? data.message ?? JSON.stringify(data) };
  return { user: data, error: null };
}

async function updateUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  password: string
) {
  const res = await supabaseAdminFetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}`,
    serviceRoleKey,
    {
      method: "PUT",
      body: JSON.stringify({
        password,
        email_confirm: true,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) return { error: data.msg ?? data.message ?? JSON.stringify(data) };
  return { error: null };
}

export async function POST(request: Request) {
  // ── Rate limit: 5 requests per hour ──
  const rateLimit = checkRateLimit("setup-demo", {
    maxRequests: 5,
    windowSeconds: 3600,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  // ── Auth check ──
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SETUP_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Config check ──
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing SUPABASE_URL or SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // ── Fetch existing users once ──
  const { users: existingUsers, error: listError } = await listUsers(
    supabaseUrl,
    serviceRoleKey
  );

  if (listError) {
    return NextResponse.json(
      { error: `Failed to list users: ${listError}` },
      { status: 500 }
    );
  }

  const results: Record<string, string> = {};

  for (const user of USERS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = existingUsers.find((u: any) => u.email === user.email);

      if (existing) {
        const { error: updErr } = await updateUser(
          supabaseUrl,
          serviceRoleKey,
          existing.id,
          user.password
        );
        results[user.label] = updErr
          ? `update_error: ${updErr}`
          : `updated (id: ${existing.id})`;
      } else {
        // User doesn't exist — try creating
        const { user: created, error: crtErr } = await createUser(
          supabaseUrl,
          serviceRoleKey,
          user.email,
          user.password
        );
        results[user.label] = crtErr
          ? `create_error: ${crtErr}`
          : `created (id: ${created?.id})`;
      }
    } catch (err) {
      results[user.label] = `exception: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({ ok: true, results });
}
