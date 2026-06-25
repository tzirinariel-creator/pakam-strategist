import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/demo-login
 *
 * Signs in as the demo user without exposing the password to the client.
 * The demo credentials are stored as server-only environment variables
 * (no NEXT_PUBLIC_ prefix), so they never appear in the browser bundle.
 */
export async function POST(request: NextRequest) {
  // ── Rate limit: 10 demo logins per minute per IP ──
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rl = checkRateLimit(`demo-login:${ip}`, {
    maxRequests: 10,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.resetInSeconds) } },
    );
  }

  // ── Read server-only credentials ──
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
  const demoPassword = process.env.DEMO_USER_PASSWORD;

  if (!demoEmail || !demoPassword) {
    return NextResponse.json(
      { error: "Demo login is not configured" },
      { status: 404 },
    );
  }

  // ── Create Supabase client that can set cookies on the response ──
  const response = NextResponse.json({ ok: true });

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

  // ── Sign in with server-side password ──
  const { error } = await supabase.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  });

  if (error) {
    return NextResponse.json(
      { error: "Demo login failed" },
      { status: 401 },
    );
  }

  return response;
}
