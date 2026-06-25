-- CreateTable
CREATE TABLE "study_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "taskType" TEXT NOT NULL,
    "courseCode" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_tasks_userId_idx" ON "study_tasks"("userId");
CREATE INDEX "study_tasks_userId_startDate_idx" ON "study_tasks"("userId", "startDate");

-- AddForeignKey
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
