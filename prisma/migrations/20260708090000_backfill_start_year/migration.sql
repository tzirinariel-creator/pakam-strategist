-- Backfill User.startYear from the stored year-of-study (note #43 — the
-- semester question leaves Settings; the start-year anchor replaces it).
-- Constant 2025 = the current academic year (תשפ"ו) AT RUN TIME; valid until
-- 17.10.2026 — if applied later, update the constant to the then-current year.
UPDATE "users" SET "startYear" = 2025 - ("currentYear" - 1) WHERE "startYear" IS NULL;
