-- Per-semester miluim modeling. PURELY ADDITIVE: one new table + one new
-- defaulted column on "users". No existing column is dropped, renamed, or
-- retyped, so existing rows and the credit/grade calculations are unaffected.

-- CreateTable
CREATE TABLE "miluim_semesters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "semester" "Semester" NOT NULL,
    "daysServed" INTEGER NOT NULL DEFAULT 0,
    "isCombat" BOOLEAN NOT NULL DEFAULT false,
    "derivedGroup" "MiluimGroup" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "miluim_semesters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miluim_semesters_userId_idx" ON "miluim_semesters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "miluim_semesters_userId_academicYear_semester_key" ON "miluim_semesters"("userId", "academicYear", "semester");

-- AddForeignKey
ALTER TABLE "miluim_semesters" ADD CONSTRAINT "miluim_semesters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "miluimBinaryUsed" INTEGER NOT NULL DEFAULT 0;
