/**
 * Demo data reset for the demo user account.
 * Used by the resetDemoUser tRPC mutation to wipe all user data
 * so the demo user starts fresh from the onboarding wizard.
 *
 * Each demo session starts from scratch — the user builds their
 * own degree plan through the onboarding wizard, just like a real user.
 */

import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------
// Main reset function — clears ALL user data
// ---------------------------------------------------------------

export async function seedDemoData(db: PrismaClient, userId: string) {
  // 1. Clear all existing data for this user
  await db.$transaction([
    db.studyTask.deleteMany({ where: { userId } }),
    db.calendarEvent.deleteMany({ where: { userId } }),
    db.chatSession.deleteMany({ where: { userId } }),
    db.studyMaterial.deleteMany({ where: { userId } }),
    db.synthesisNote.deleteMany({ where: { userId } }),
    db.syllabus.deleteMany({ where: { userId } }),
    db.userCourse.deleteMany({ where: { userId } }),
  ]);

  // 2. Reset user profile to defaults — onboarding wizard will fill these in
  await db.user.update({
    where: { id: userId },
    data: {
      displayName: null,
      focusArea: null,
      currentYear: 1,
      currentSemester: "FALL",
      startYear: null,
      locale: "he",
      theme: "dark",
      miluimGroup: "NONE",
      miluimCreditsUsed: 0,
      amiramScore: null,
    },
  });

  return { coursesCreated: 0, tasksCreated: 0 };
}
