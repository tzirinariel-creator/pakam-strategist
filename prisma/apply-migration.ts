// =========================================
// Apply a single Prisma migration via a direct pg connection.
// Idempotent + transactional — the project's safe path when
// `prisma migrate deploy` can't reach DIRECT_URL (Supabase pooler).
// Mirrors run-migration-c3.ts but takes the migration name as an arg.
//
// Run: npx tsx prisma/apply-migration.ts <migration_dir_name>
// e.g. npx tsx prisma/apply-migration.ts 20260628130000_add_user_course_binary
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
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

const migrationName: string = process.argv[2] ?? "";
if (!migrationName) {
  throw new Error("Usage: npx tsx prisma/apply-migration.ts <migration_dir_name>");
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL must be set");

async function main() {
  const sqlPath = path.join(__dirname, "migrations", migrationName, "migration.sql");
  if (!fs.existsSync(sqlPath)) throw new Error(`No migration.sql at ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, "utf-8");

  console.log(`🔌 Connecting…`);
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("✅ Connected");

  try {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS c FROM "_prisma_migrations" WHERE migration_name = $1`,
      [migrationName]
    );
    if (rows[0] && rows[0].c > 0) {
      console.log(`⚠️  '${migrationName}' already applied — skipping.`);
      return;
    }

    console.log(`🚀 Applying '${migrationName}'…`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
       VALUES (gen_random_uuid(), 'manual', $1, NOW(), 1)`,
      [migrationName]
    );
    await client.query("COMMIT");
    console.log("✅ Applied and recorded.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Failed — rolled back:", err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
