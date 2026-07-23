-- Per-reporter dedup for cohort insights and the plans gallery (#audit-r1,
-- 24.7 launch audit). Mirrors review_reports: one row per (item, reporter),
-- unique so no single account can drive an item to HIDDEN on its own.
-- Additive only.

-- CreateTable
CREATE TABLE "insight_reports" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insight_reports_insightId_idx" ON "insight_reports"("insightId");
CREATE UNIQUE INDEX "insight_reports_insightId_userId_key" ON "insight_reports"("insightId", "userId");

-- AddForeignKey
ALTER TABLE "insight_reports" ADD CONSTRAINT "insight_reports_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "cohort_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "plan_reports" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_reports_entryId_idx" ON "plan_reports"("entryId");
CREATE UNIQUE INDEX "plan_reports_entryId_userId_key" ON "plan_reports"("entryId", "userId");

-- AddForeignKey
ALTER TABLE "plan_reports" ADD CONSTRAINT "plan_reports_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "shared_plan_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
