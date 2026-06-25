-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "yedionUrl" TEXT;

-- AlterTable
ALTER TABLE "schedule_sessions" ADD COLUMN     "lecturerEmail" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "coursesChecked" INTEGER NOT NULL DEFAULT 0,
    "changesFound" INTEGER NOT NULL DEFAULT 0,
    "changesApplied" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "diffJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");
