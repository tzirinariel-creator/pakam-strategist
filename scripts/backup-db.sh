#!/usr/bin/env bash
# =============================================================================
# Free manual production-DB backup — run before EVERY migration, and periodically.
#
# Why this exists: Supabase's FREE plan has no automatic backups and no
# point-in-time-recovery (see docs/נוהל-תקלה.md §5). This app performs
# destructive writes (savePlan delete-replace, hard account delete), so a bad
# migration or bug could permanently lose real student data with nothing to
# restore from. This dump is the free safety net until the owner decides on a
# paid plan.
#
# The dump holds REAL student data → it is written to ./backups (gitignored)
# and must NEVER be committed or placed on shared storage.
#
# Prefers a DIRECT (non-pooled) connection for pg_dump — DIRECT_URL if set,
# else DATABASE_URL. pg_dump is the primary path (no Docker needed, and it is
# preinstalled on GitHub Actions runners); the supabase CLI is only a fallback
# and it requires Docker locally, so it will not run in a Docker-less env.
#
# Usage:  npm run backup   (DATABASE_URL or DIRECT_URL must be in your env)
# =============================================================================
set -euo pipefail

DUMP_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
if [[ -z "${DUMP_URL}" ]]; then
  echo "✗ Neither DIRECT_URL nor DATABASE_URL is set." >&2
  echo "  Load one from your local .env.local or the Vercel project first." >&2
  exit 1
fi

mkdir -p backups
STAMP="$(date +%Y-%m-%d-%H%M%S)"
OUT="backups/pakam-${STAMP}.sql"

echo "→ Dumping production DB to ${OUT} …"
if command -v pg_dump >/dev/null 2>&1; then
  # Primary: direct pg_dump. --no-owner/--no-privileges keep the dump portable
  # for a restore into a fresh Supabase project.
  pg_dump "${DUMP_URL}" --no-owner --no-privileges -f "${OUT}"
elif npx --yes supabase --version >/dev/null 2>&1; then
  echo "  (pg_dump not found — falling back to the supabase CLI, which needs Docker)"
  npx --yes supabase db dump --db-url "${DUMP_URL}" -f "${OUT}"
else
  echo "✗ No pg_dump and no supabase CLI available." >&2
  echo "  Install the Postgres client: 'brew install libpq' (macOS) then add" >&2
  echo "  \$(brew --prefix libpq)/bin to PATH, or 'apt-get install postgresql-client'." >&2
  rm -f "${OUT}"
  exit 1
fi

SIZE="$(du -h "${OUT}" | cut -f1)"
echo "✓ Backup written: ${OUT} (${SIZE})"
echo "  ⚠ This file holds real student data — keep it OFF the repo and off shared storage."
