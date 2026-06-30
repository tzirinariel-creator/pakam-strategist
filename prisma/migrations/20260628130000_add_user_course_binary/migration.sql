-- AlterTable: per-course miluim binary (pass/fail) flag
ALTER TABLE "user_courses" ADD COLUMN "isBinary" BOOLEAN NOT NULL DEFAULT false;
