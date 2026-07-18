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
# Usage:  npm run backup        (DATABASE_URL must be loaded in your env)
# =============================================================================
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✗ DATABASE_URL is not set." >&2
  echo "  Load it from your local .env or the Vercel project first, then re-run." >&2
  exit 1
fi

mkdir -p backups
STAMP="$(date +%Y-%m-%d-%H%M%S)"
OUT="backups/pakam-${STAMP}.sql"

echo "→ Dumping production DB to ${OUT} …"
npx --yes supabase db dump --db-url "$DATABASE_URL" -f "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ Backup written: ${OUT} (${SIZE})"
echo "  ⚠ This file holds real student data — keep it OFF the repo and off shared storage."
