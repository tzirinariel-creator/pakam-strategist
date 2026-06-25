-- Add grade/difficulty fields to courses table (from Arazim Project data)
ALTER TABLE "courses" ADD COLUMN "averageGrade" DOUBLE PRECISION;
ALTER TABLE "courses" ADD COLUMN "medianGrade" DOUBLE PRECISION;
ALTER TABLE "courses" ADD COLUMN "gradeStdDev" DOUBLE PRECISION;
ALTER TABLE "courses" ADD COLUMN "failRate" DOUBLE PRECISION;
ALTER TABLE "courses" ADD COLUMN "difficultyLevel" TEXT;
ALTER TABLE "courses" ADD COLUMN "gradeDataSource" TEXT;
ALTER TABLE "courses" ADD COLUMN "gradeDataYear" TEXT;
