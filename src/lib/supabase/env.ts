/**
 * Supabase environment configuration.
 *
 * Validates the required NEXT_PUBLIC_SUPABASE_* variables once, at import
 * time, so a misconfigured deploy fails loudly with an actionable message
 * instead of crashing opaquely deep inside the Supabase client. Used by the
 * browser client, the server client, and the middleware.
 *
 * These are NEXT_PUBLIC_ vars (inlined at build time), so a missing value
 * here means the build/deploy environment is misconfigured.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ` +
        `in your environment (e.g. .env.local or your deploy provider) before starting the app.`,
    );
  }
  return value;
}

export const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = requireEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
