-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "examDateA" TIMESTAMP(3),
ADD COLUMN     "examDateB" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "schedule_sessions" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "building" TEXT,
    "sessionType" TEXT NOT NULL DEFAULT 'lecture',
    "semester" "Semester" NOT NULL,
    "academicYear" INTEGER NOT NULL DEFAULT 2025,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_sessions_courseCode_idx" ON "schedule_sessions"("courseCode");

-- CreateIndex
CREATE INDEX "schedule_sessions_semester_academicYear_idx" ON "schedule_sessions"("semester", "academicYear");

-- AddForeignKey
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "courses"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
