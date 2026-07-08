import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/init";
import {
  getDecryptedTokens,
  withTokenRefresh,
  pushEventsToGoogle,
  pullEventsFromGoogle,
  deleteEventsFromGoogle,
  type PushableEvent,
} from "@/lib/google-calendar";
import { getAcademicNow, getTeachingRange } from "@/lib/academic-calendar";

export const scheduleRouter = createTRPCRouter({
  /**
   * Get schedule sessions for a specific semester.
   * Returns all ScheduleSession records for courses in the user's plan
   * for the given year + semester.
   */
  getScheduleForSemester: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(1).max(4),
        semester: z.enum(["FALL", "SPRING", "SUMMER"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      // Return empty schedule for users who haven't completed profile setup yet
      if (!user) {
        return { sessions: [] };
      }

      // Get user's courses for this semester
      const userCourses = await ctx.db.userCourse.findMany({
        where: {
          userId: user.id,
          plannedYear: input.year,
          plannedSemester: input.semester,
        },
        include: { course: true },
      });

      if (userCourses.length === 0) {
        return { sessions: [], courses: userCourses };
      }

      // Get course codes from the user's plan
      const courseCodes = userCourses.map((uc) => uc.course.code);

      // Build a map of courseCode → selectedGroups for filtering
      const groupSelectionsByCode = new Map<string, Record<string, string>>();
      for (const uc of userCourses) {
        if (uc.selectedGroups && typeof uc.selectedGroups === "object") {
          groupSelectionsByCode.set(
            uc.course.code,
            uc.selectedGroups as Record<string, string>,
          );
        }
      }

      // Fetch schedule sessions for those courses
      const allSessions = await ctx.db.scheduleSession.findMany({
        where: {
          courseCode: { in: courseCodes },
          semester: input.semester,
        },
        include: {
          course: true,
        },
        orderBy: [
          { dayOfWeek: "asc" },
          { startTime: "asc" },
        ],
      });

      // Filter sessions by selected groups:
      // - If user has no selectedGroups for a course → include all sessions (backward compat)
      // - If user selected groups → include session if:
      //   a) its sessionType is not in the selections (e.g. lectures) → include
      //   b) its sessionType IS in selections and groupCode matches → include
      //   c) its sessionType IS in selections but groupCode differs → exclude
      const sessions = allSessions.filter((session) => {
        const selections = groupSelectionsByCode.get(session.courseCode);
        if (!selections) return true; // no selections → include all

        const sessionType = (session.sessionType ?? "").toLowerCase();
        const selectedGroup = selections[sessionType];
        if (selectedGroup === undefined) return true; // this type not in selections → include

        // User selected a specific group for this type — match groupCode
        return session.groupCode === selectedGroup;
      });

      return {
        sessions,
        courses: userCourses,
      };
    }),

  /**
   * Get exam schedule for the user's courses.
   * Returns all courses with exam dates, grouped by date.
   */
  getExamSchedule: protectedProcedure
    .input(
      z
        .object({
          year: z.number().int().min(1).max(4).optional(),
          semester: z.enum(["FALL", "SPRING", "SUMMER"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      // Return empty exams for users who haven't completed profile setup yet
      if (!user) {
        return { exams: [] };
      }

      // Build filter based on optional year/semester. Exclude courses the
      // student already finished WITH a grade — a graded course doesn't need its
      // exam on the upcoming board anymore (reported #33/#8).
      const whereClause: Record<string, unknown> = {
        userId: user.id,
        NOT: { AND: [{ status: "COMPLETED" }, { grade: { not: null } }] },
      };
      if (input?.year) whereClause.plannedYear = input.year;
      if (input?.semester) whereClause.plannedSemester = input.semester;

      const userCourses = await ctx.db.userCourse.findMany({
        where: whereClause,
        include: {
          course: true,
        },
        orderBy: [
          { plannedYear: "asc" },
          { plannedSemester: "asc" },
        ],
      });

      // Build exam entries — only courses that have exam dates
      const exams: {
        userCourseId: string;
        courseCode: string;
        courseName: string;
        discipline: string;
        credits: number;
        status: string;
        grade: number | null;
        plannedYear: number;
        plannedSemester: string;
        examDateA: Date | null;
        examDateB: Date | null;
        courseType: string;
        submissionType: string;
      }[] = [];

      // De-dupe by course code (#35 root cause 2): a retake has TWO UserCourse
      // rows sharing the same Course.examDateA/B — the exam would show twice in
      // the exams tab and the home countdown. The rows arrive ordered by
      // year/semester asc, so the LAST write per code = the latest attempt.
      const byCode = new Map<string, (typeof exams)[number]>();
      for (const uc of userCourses) {
        if (uc.course.examDateA || uc.course.examDateB) {
          byCode.set(uc.course.code, {
            userCourseId: uc.id,
            courseCode: uc.course.code,
            courseName: uc.course.nameHe,
            discipline: (uc.disciplineOverride ?? uc.course.discipline) as string,
            credits: uc.course.credits,
            status: uc.status,
            grade: uc.grade,
            plannedYear: uc.plannedYear,
            plannedSemester: uc.plannedSemester,
            examDateA: uc.course.examDateA,
            examDateB: uc.course.examDateB,
            courseType: uc.course.courseType,
            submissionType: uc.course.submissionType,
          });
        }
      }
      exams.push(...byCode.values());

      // Sort by examDateA
      exams.sort((a, b) => {
        const dateA = a.examDateA?.getTime() ?? Infinity;
        const dateB = b.examDateA?.getTime() ?? Infinity;
        return dateA - dateB;
      });

      return { exams };
    }),

  /**
   * Get all schedule sessions for a given course code.
   * Useful for conflict detection when adding a course.
   */
  getSessionsForCourse: protectedProcedure
    .input(z.object({ courseCode: z.string() }))
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.db.scheduleSession.findMany({
        where: { courseCode: input.courseCode },
        orderBy: [
          { semester: "asc" },
          { dayOfWeek: "asc" },
          { startTime: "asc" },
        ],
      });

      return { sessions };
    }),

  // ─── Google Calendar Sync ───────────────────────────────────

  /**
   * Check if the user has a valid Google Calendar connection.
   */
  getGoogleStatus: protectedProcedure.query(async ({ ctx }) => {
    const tokens = await getDecryptedTokens(ctx.userId!);
    // Whether Google OAuth is configured on the server — the UI hides the
    // integration entirely when it isn't, so the button can't reach an error page.
    const configured = Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );
    return {
      connected: tokens !== null,
      configured,
    };
  }),

  /**
   * Push course schedule + exams to Google Calendar.
   * Creates weekly recurring events for lectures and single events for exams.
   */
  syncToGoogle: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(1).max(4),
        semester: z.enum(["FALL", "SPRING", "SUMMER"]),
        contentFilter: z.enum(["all", "lectures", "exams"]).default("all"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Get user's courses for this semester
      const userCourses = await ctx.db.userCourse.findMany({
        where: {
          userId: user.id,
          plannedYear: input.year,
          plannedSemester: input.semester,
        },
        include: { course: true },
      });

      if (userCourses.length === 0) {
        return { synced: 0 };
      }

      // Get schedule sessions — filtered by user's selected groups
      const courseCodes = userCourses.map((uc) => uc.course.code);

      // Build a map of courseCode → selectedGroups for filtering
      const groupSelectionsByCode = new Map<string, Record<string, string>>();
      for (const uc of userCourses) {
        if (uc.selectedGroups && typeof uc.selectedGroups === "object") {
          groupSelectionsByCode.set(
            uc.course.code,
            uc.selectedGroups as Record<string, string>,
          );
        }
      }

      const allSessions = await ctx.db.scheduleSession.findMany({
        where: {
          courseCode: { in: courseCodes },
          semester: input.semester,
        },
        include: { course: true },
      });

      // Filter by selected groups (same logic as getScheduleForSemester)
      const sessions = allSessions.filter((session) => {
        const selections = groupSelectionsByCode.get(session.courseCode);
        if (!selections) return true;
        const sessionType = (session.sessionType ?? "").toLowerCase();
        const selectedGroup = selections[sessionType];
        if (selectedGroup === undefined) return true;
        return session.groupCode === selectedGroup;
      });

      // Build pushable events from sessions
      const events: PushableEvent[] = [];

      // Session type labels in Hebrew
      const sessionTypeHe: Record<string, string> = {
        lecture: "הרצאה",
        tutorial: "תרגול",
        lab: "מעבדה",
        LECTURE: "הרצאה",
        TUTORIAL: "תרגול",
        LAB: "מעבדה",
      };

      // Semester teaching ranges — from THE academic-calendar module (verified
      // TAU dates), shared with the .ics export so both paths place classes on
      // identical dates. SUMMER isn't a teaching semester for PPE — use the
      // current year's summer-session window from the same module.
      const acadNow = getAcademicNow();
      const semesterDates: Record<string, { start: Date; end: Date }> = {
        FALL: getTeachingRange("FALL"),
        SPRING: getTeachingRange("SPRING"),
        SUMMER: acadNow.summer ?? { start: acadNow.nextTeachingStart, end: acadNow.nextTeachingStart },
      };

      const semRange = semesterDates[input.semester];

      // Day-of-week mapping (sessions use "SUNDAY"..."FRIDAY", JS Date uses 0=Sunday...6=Saturday)
      const dayMap: Record<string, number> = {
        SUNDAY: 0,
        MONDAY: 1,
        TUESDAY: 2,
        WEDNESDAY: 3,
        THURSDAY: 4,
        FRIDAY: 5,
      };

      // Helper: format date as RRULE UNTIL value (YYYYMMDDTHHMMSSZ)
      const formatUntil = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}${m}${day}T235959Z`;
      };

      // Build lecture/tutorial events (skip if user chose exams-only)
      for (const session of (input.contentFilter === "exams" ? [] : sessions)) {
        // Parse start/end times (format: "HH:MM")
        const [startH, startM] = (session.startTime ?? "09:00")
          .split(":")
          .map(Number);
        const [endH, endM] = (session.endTime ?? "10:00")
          .split(":")
          .map(Number);

        // Find the first occurrence of this day within the semester
        const targetDay = dayMap[session.dayOfWeek] ?? 0;
        const baseDate = semRange ? new Date(semRange.start) : new Date();
        const baseDay = baseDate.getDay();
        const daysUntil =
          targetDay >= baseDay
            ? targetDay - baseDay
            : 7 - (baseDay - targetDay);

        const startDate = new Date(baseDate);
        startDate.setDate(startDate.getDate() + daysUntil);
        startDate.setHours(startH ?? 9, startM ?? 0, 0, 0);

        const endDate = new Date(startDate);
        endDate.setHours(endH ?? 10, endM ?? 0, 0, 0);

        const courseName =
          session.course?.nameHe ?? session.courseCode;

        // Build recurrence rule bounded to semester end
        const typeLabel = sessionTypeHe[session.sessionType ?? "lecture"] ?? session.sessionType ?? "הרצאה";
        const recurrenceRule = semRange
          ? `RRULE:FREQ=WEEKLY;UNTIL=${formatUntil(semRange.end)}`
          : "RRULE:FREQ=WEEKLY;COUNT=14";

        events.push({
          // ScheduleSession ids are GLOBAL (shared by every student of a course),
          // and CalendarEvent.id is the primary key — so a bare session.id here
          // let one student's sync overwrite another's Google-event mapping.
          // Namespace it per user so each student owns a distinct CalendarEvent
          // row. (Exam ids already use the per-user UserCourse id.) A user who
          // synced before this fix may see their lecture events once more on the
          // next sync; "מחק אירועים מהיומן" clears the old rows.
          id: `lec-${user.id}-${session.id}`,
          title: `${courseName} — ${typeLabel}`,
          description: [session.courseCode, session.room, session.lecturerName].filter(Boolean).join(" · "),
          startTime: startDate,
          endTime: endDate,
          location: session.room ?? undefined,
          recurrence: recurrenceRule,
        });
      }

      // Add exam events (skip if user chose lectures-only)
      for (const uc of (input.contentFilter === "lectures" ? [] : userCourses)) {
        if (uc.course.examDateA) {
          const examDate = new Date(uc.course.examDateA);
          examDate.setHours(9, 0, 0, 0);
          const examEnd = new Date(examDate);
          examEnd.setHours(12, 0, 0, 0);

          events.push({
            id: `exam-a-${uc.id}`,
            title: `${uc.course.nameHe} — מועד א׳`,
            description: `${uc.course.code} · ${uc.course.credits} ש״ס`,
            startTime: examDate,
            endTime: examEnd,
          });
        }

        if (uc.course.examDateB) {
          const examDate = new Date(uc.course.examDateB);
          examDate.setHours(9, 0, 0, 0);
          const examEnd = new Date(examDate);
          examEnd.setHours(12, 0, 0, 0);

          events.push({
            id: `exam-b-${uc.id}`,
            title: `${uc.course.nameHe} — מועד ב׳`,
            description: `${uc.course.code} · ${uc.course.credits} ש״ס`,
            startTime: examDate,
            endTime: examEnd,
          });
        }
      }

      // Load existing CalendarEvent records to pass googleEventId for updates (prevents duplicates)
      const existingCalEvents = await ctx.db.calendarEvent.findMany({
        where: {
          userId: user.id,
          googleEventId: { not: null },
        },
        select: { id: true, googleEventId: true },
      });
      const existingIdMap = new Map(
        existingCalEvents
          .filter((e) => e.googleEventId)
          .map((e) => [e.id, e.googleEventId!]),
      );

      // Attach existing googleEventId to events for upsert
      for (const event of events) {
        const existing = existingIdMap.get(event.id);
        if (existing) {
          event.googleEventId = existing;
        }
      }

      // Push to Google Calendar with token refresh handling
      const idMap = await withTokenRefresh(ctx.userId!, (calendar) =>
        pushEventsToGoogle(calendar, events),
      );

      // Persist googleEventIds in CalendarEvent table for future updates/deletes
      for (const [localId, googleId] of idMap) {
        const matchingEvent = events.find((e) => e.id === localId);
        if (!matchingEvent) continue;

        await ctx.db.calendarEvent.upsert({
          where: { id: localId },
          update: { googleEventId: googleId },
          create: {
            id: localId,
            userId: user.id,
            title: matchingEvent.title,
            startTime: matchingEvent.startTime,
            endTime: matchingEvent.endTime,
            eventType: localId.startsWith("exam-") ? "EXAM" : "LECTURE",
            googleEventId: googleId,
          },
        });
      }

      return { synced: idMap.size };
    }),

  /**
   * Delete all synced events from Google Calendar and local DB.
   */
  deleteGoogleEvents: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Find all CalendarEvents with a googleEventId
    const calEvents = await ctx.db.calendarEvent.findMany({
      where: {
        userId: user.id,
        googleEventId: { not: null },
      },
      select: { id: true, googleEventId: true },
    });

    if (calEvents.length === 0) {
      return { deleted: 0 };
    }

    const googleIds = calEvents
      .map((e) => e.googleEventId)
      .filter((id): id is string => id !== null);

    // Delete from Google Calendar
    let deletedFromGoogle = 0;
    if (googleIds.length > 0) {
      deletedFromGoogle = await withTokenRefresh(ctx.userId!, (calendar) =>
        deleteEventsFromGoogle(calendar, googleIds),
      );
    }

    // Delete local CalendarEvent records
    await ctx.db.calendarEvent.deleteMany({
      where: {
        userId: user.id,
        googleEventId: { not: null },
      },
    });

    return { deleted: deletedFromGoogle };
  }),

  /**
   * Pull events from Google Calendar into local CalendarEvent table.
   */
  pullFromGoogle: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { supabaseId: ctx.userId },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const googleEvents = await withTokenRefresh(
      ctx.userId!,
      (calendar) => pullEventsFromGoogle(calendar),
    );

    let imported = 0;

    for (const gEvent of googleEvents) {
      if (!gEvent.id || !gEvent.start?.dateTime || !gEvent.end?.dateTime) {
        continue;
      }

      // Find existing event by googleEventId, then update or create.
      // Avoids setting non-UUID id values — let Prisma auto-generate UUIDs.
      const existingEvent = await ctx.db.calendarEvent.findFirst({
        where: { googleEventId: gEvent.id, userId: user.id },
      });

      if (existingEvent) {
        await ctx.db.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            title: gEvent.summary ?? "Google Calendar Event",
            description: gEvent.description ?? null,
            startTime: new Date(gEvent.start.dateTime),
            endTime: new Date(gEvent.end.dateTime),
            color: gEvent.colorId ?? null,
          },
        });
      } else {
        await ctx.db.calendarEvent.create({
          data: {
            userId: user.id,
            title: gEvent.summary ?? "Google Calendar Event",
            description: gEvent.description ?? null,
            startTime: new Date(gEvent.start.dateTime),
            endTime: new Date(gEvent.end.dateTime),
            eventType: "GOOGLE_SYNCED",
            googleEventId: gEvent.id,
            color: gEvent.colorId ?? null,
          },
        });
      }

      imported++;
    }

    return { imported };
  }),
});
