import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "prisma/config";

// Load .env.local manually (Prisma 7 doesn't auto-load it)
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx);
        const val = trimmed.substring(eqIdx + 1);
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  datasource: {
    // Use DIRECT_URL for migrations (bypasses connection pooler)
    // Falls back to DATABASE_URL if DIRECT_URL is not set
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
