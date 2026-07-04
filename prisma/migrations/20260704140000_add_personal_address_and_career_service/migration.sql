-- AlterTable: personal address (name + gender for personalized/gendered copy)
-- + career-service miluim marker (Group C via career service, not 35+ reserve days).
-- Additive, nullable / defaulted columns — safe on existing rows.
ALTER TABLE "users" ADD COLUMN "firstName" TEXT;
ALTER TABLE "users" ADD COLUMN "lastName" TEXT;
ALTER TABLE "users" ADD COLUMN "gender" TEXT;
ALTER TABLE "users" ADD COLUMN "miluimCareerService" BOOLEAN NOT NULL DEFAULT false;
