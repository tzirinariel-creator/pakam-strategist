-- =========================================
-- C3: Multi-Program Support Migration
-- Converts Discipline enum → TEXT, adds University + Program tables
-- =========================================

-- Step 1: Convert all Discipline enum columns to TEXT
-- USING "col"::TEXT preserves existing values as plain strings

ALTER TABLE "users" ALTER COLUMN "focusArea" TYPE TEXT USING "focusArea"::TEXT;

ALTER TABLE "courses" ALTER COLUMN "discipline" TYPE TEXT USING "discipline"::TEXT;

ALTER TABLE "courses" ALTER COLUMN "canCountAs" TYPE TEXT[] USING "canCountAs"::TEXT[];

ALTER TABLE "user_courses" ALTER COLUMN "disciplineOverride" TYPE TEXT USING "disciplineOverride"::TEXT;

ALTER TABLE "synthesis_notes" ALTER COLUMN "disciplines" TYPE TEXT[] USING "disciplines"::TEXT[];

-- Step 2: Drop the Discipline enum type (no longer used)
DROP TYPE IF EXISTS "Discipline";

-- Step 3: Create University table
CREATE TABLE "universities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "yedionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- Step 4: Create Program table
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- Step 5: Add FK columns (nullable, non-breaking)
ALTER TABLE "users" ADD COLUMN "programId" TEXT;

ALTER TABLE "courses" ADD COLUMN "universityId" TEXT;

-- Step 6: Create indexes and constraints

-- University unique code
CREATE UNIQUE INDEX "universities_code_key" ON "universities"("code");

-- Program unique per university+code+year
CREATE UNIQUE INDEX "programs_universityId_code_academicYear_key" ON "programs"("universityId", "code", "academicYear");

-- FK: Program → University
ALTER TABLE "programs" ADD CONSTRAINT "programs_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: User → Program (optional)
ALTER TABLE "users" ADD CONSTRAINT "users_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: Course → University (optional)
ALTER TABLE "courses" ADD CONSTRAINT "courses_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
