-- CreateEnum
CREATE TYPE "RecommendVerdict" AS ENUM ('RECOMMEND', 'NEUTRAL', 'AVOID');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'PENDING');

-- CreateTable
CREATE TABLE "course_grade_points" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "grade" DOUBLE PRECISION,
    "cohortYear" INTEGER,
    "isBinary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'import',
    "dedupeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_grade_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "cohortYear" INTEGER,
    "workload" INTEGER,
    "difficulty" INTEGER,
    "verdict" "RecommendVerdict",
    "tip" TEXT,
    "tags" TEXT[],
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_grade_points_dedupeHash_key" ON "course_grade_points"("dedupeHash");
CREATE INDEX "course_grade_points_courseCode_idx" ON "course_grade_points"("courseCode");
CREATE INDEX "course_grade_points_courseCode_cohortYear_idx" ON "course_grade_points"("courseCode", "cohortYear");

-- CreateIndex
CREATE UNIQUE INDEX "course_reviews_userId_courseCode_key" ON "course_reviews"("userId", "courseCode");
CREATE INDEX "course_reviews_courseCode_idx" ON "course_reviews"("courseCode");
CREATE INDEX "course_reviews_courseCode_status_idx" ON "course_reviews"("courseCode", "status");

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
