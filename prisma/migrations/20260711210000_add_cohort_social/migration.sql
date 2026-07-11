-- Approved by owner 11.7.2026 ("מאשר לך את שתי הטבלאות") — additive only.
CREATE TABLE "cohort_insights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "cohortYear" INTEGER,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cohort_insights_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cohort_insights_userId_stage_key" ON "cohort_insights"("userId", "stage");
CREATE INDEX "cohort_insights_stage_status_idx" ON "cohort_insights"("stage", "status");
ALTER TABLE "cohort_insights" ADD CONSTRAINT "cohort_insights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "shared_plan_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cohortYear" INTEGER,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_plan_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shared_plan_entries_status_createdAt_idx" ON "shared_plan_entries"("status", "createdAt");
ALTER TABLE "shared_plan_entries" ADD CONSTRAINT "shared_plan_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
