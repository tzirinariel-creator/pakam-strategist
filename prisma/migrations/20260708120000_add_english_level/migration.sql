-- English level (#23) — overrides the Amiram score when the student knows their
-- level directly ("מתקדמים ב'"), which the real grade sheet prints without a
-- number. Additive nullable column; safe. Run BEFORE deploying the code that
-- reads User.englishLevel. Values: EXEMPT | ADVANCED_B | ADVANCED_A | BASIC | PRE_BASIC.
ALTER TABLE "users" ADD COLUMN "englishLevel" TEXT;
