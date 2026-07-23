-- Consent-based named mentoring (owner decision 23.7) — ADDITIVE ONLY.
-- A mentee lets a specific mentor VIEW their plan (plan-only, never grades).
CREATE TYPE "MentorLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'ENDED');

CREATE TABLE "mentor_links" (
    "id" TEXT NOT NULL,
    "menteeUserId" TEXT NOT NULL,
    "mentorUserId" TEXT NOT NULL,
    "status" "MentorLinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "mentor_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mentor_links_menteeUserId_mentorUserId_key" ON "mentor_links"("menteeUserId", "mentorUserId");
CREATE INDEX "mentor_links_mentorUserId_status_idx" ON "mentor_links"("mentorUserId", "status");
CREATE INDEX "mentor_links_menteeUserId_status_idx" ON "mentor_links"("menteeUserId", "status");

ALTER TABLE "mentor_links" ADD CONSTRAINT "mentor_links_menteeUserId_fkey" FOREIGN KEY ("menteeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentor_links" ADD CONSTRAINT "mentor_links_mentorUserId_fkey" FOREIGN KEY ("mentorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
