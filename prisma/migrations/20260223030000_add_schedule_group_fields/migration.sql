-- AlterTable
ALTER TABLE "schedule_sessions" ADD COLUMN "groupCode" TEXT;
ALTER TABLE "schedule_sessions" ADD COLUMN "lecturerName" TEXT;

-- CreateIndex
CREATE INDEX "schedule_sessions_courseCode_groupCode_idx" ON "schedule_sessions"("courseCode", "groupCode");
