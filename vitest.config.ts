import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Harmless placeholders for the build-time-public Supabase vars. The router
    // tests import the tRPC stack, which loads @/lib/supabase/* and validates
    // these at import time. Unit tests never make a real Supabase call (the
    // caller's ctx supplies a fake client), so any non-empty value works.
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key",
      // Pin the suite to the users' timezone. All day-key/skyline logic is
      // local-midnight based; without a pin the suite passes or fails
      // depending on the machine (verified failure under TZ=America/New_York).
      TZ: "Asia/Jerusalem",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
