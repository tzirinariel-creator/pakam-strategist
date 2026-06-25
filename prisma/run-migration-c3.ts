// =========================================
// Run C3 migration via pooler connection
// Use when prisma migrate deploy can't reach DIRECT_URL
// Run: npx tsx prisma/run-migration-c3.ts
// =========================================

import pg from "pg";
import fs from "node:fs";
import path from "node:path";

// Load .env.local (same approach as prisma.config.ts)
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

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_URL must be set");
}

async function main() {
  console.log("🔌 Connecting to database...");
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("✅ Connected!\n");

  // Read migration SQL
  const sqlPath = path.join(
    __dirname,
    "migrations",
    "20260305200000_multi_program_support",
    "migration.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf-8");
  console.log("📄 Loaded migration SQL\n");

  // Check if migration already applied
  const { rows } = await client.query(
    `SELECT COUNT(*) FROM "_prisma_migrations" WHERE migration_name = '20260305200000_multi_program_support'`
  );
  if (rows[0] && parseInt(rows[0].count) > 0) {
    console.log("⚠️  Migration already applied! Skipping.");
    await client.end();
    return;
  }

  // Run migration
  console.log("🚀 Running migration...");
  try {
    await client.query("BEGIN");
    await client.query(sql);

    // Record migration in Prisma's migration table
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
       VALUES (gen_random_uuid(), 'manual-c3', '20260305200000_multi_program_support', NOW(), 1)`
    );

    await client.query("COMMIT");
    console.log("✅ Migration applied successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed, rolled back:", err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
