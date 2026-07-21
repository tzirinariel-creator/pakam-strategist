-- AlterTable: server-backed alternative-assessment (paper instead of exam) flag,
-- replacing the exam planner's localStorage-only "pk-alt-assessment" toggle.
ALTER TABLE "user_courses" ADD COLUMN "altAssessment" BOOLEAN NOT NULL DEFAULT false;
