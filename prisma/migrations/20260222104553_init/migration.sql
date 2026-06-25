-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('PHILOSOPHY', 'ECONOMICS', 'POLITICAL_SCIENCE', 'LAW', 'PPE_CORE', 'GENERAL');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('MANDATORY', 'ELECTIVE', 'SEMINAR', 'PRACTICE', 'ENGLISH', 'LAW_FOUNDATION');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('PAPER', 'REFERAT', 'EXAM', 'NONE');

-- CreateEnum
CREATE TYPE "Semester" AS ENUM ('FALL', 'SPRING', 'SUMMER');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('LECTURE', 'EXAM', 'ASSIGNMENT_DUE', 'STUDY_BLOCK', 'OFFICE_HOURS', 'CUSTOM', 'GOOGLE_SYNCED');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "supabaseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "focusArea" "Discipline",
    "currentYear" INTEGER NOT NULL DEFAULT 1,
    "currentSemester" "Semester" NOT NULL DEFAULT 'FALL',
    "startYear" INTEGER,
    "encryptedClaudeKey" TEXT,
    "encryptedGoogleToken" TEXT,
    "googleRefreshToken" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT,
    "discipline" "Discipline" NOT NULL,
    "courseType" "CourseType" NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL,
    "yearOffered" INTEGER[],
    "semesterOffered" "Semester"[],
    "prerequisites" TEXT[],
    "canCountAs" "Discipline"[],
    "description" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "submissionType" "SubmissionType" NOT NULL DEFAULT 'EXAM',
    "weeklyHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_courses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'PLANNED',
    "grade" DOUBLE PRECISION,
    "plannedYear" INTEGER NOT NULL,
    "plannedSemester" "Semester" NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "isGradeImproved" BOOLEAN NOT NULL DEFAULT false,
    "disciplineOverride" "Discipline",
    "submissionType" "SubmissionType",
    "submissionGrade" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabi" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "parsedContent" JSONB,
    "deadlines" JSONB,
    "topics" TEXT[],
    "gradingBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synthesis_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "disciplines" "Discipline"[],
    "courseConnections" TEXT[],
    "tags" TEXT[],
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synthesis_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "materialType" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "eventType" "CalendarEventType" NOT NULL,
    "courseCode" TEXT,
    "googleEventId" TEXT,
    "isAiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "recurrence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "persona" TEXT NOT NULL DEFAULT 'mentor',
    "messages" JSONB[],
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseId_key" ON "users"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "user_courses_userId_idx" ON "user_courses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_courses_userId_courseId_attemptNumber_key" ON "user_courses"("userId", "courseId", "attemptNumber");

-- CreateIndex
CREATE INDEX "syllabi_userId_idx" ON "syllabi"("userId");

-- CreateIndex
CREATE INDEX "synthesis_notes_userId_idx" ON "synthesis_notes"("userId");

-- CreateIndex
CREATE INDEX "study_materials_userId_idx" ON "study_materials"("userId");

-- CreateIndex
CREATE INDEX "calendar_events_userId_idx" ON "calendar_events"("userId");

-- CreateIndex
CREATE INDEX "calendar_events_googleEventId_idx" ON "calendar_events"("googleEventId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- AddForeignKey
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthesis_notes" ADD CONSTRAINT "synthesis_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
