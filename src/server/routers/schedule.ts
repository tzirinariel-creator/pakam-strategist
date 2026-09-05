import { env } from "@/lib/env";
import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, createRequestLoaders } from "../trpc/init";
import {
  getDecryptedTokens,
  withTokenRefresh,
  pushEventsToGoogle,
  pullEventsFromGoogle,
  deleteEventsFromGoogle,
  type PushableEvent,
} from "@/lib/google-calendar";
import { getAcademicNow, getTeachingRange } from "@/lib/academic-calendar";
import { sessionTypeNameFor } from "@/lib/group-options";
import { dayOfWeekIndex } from "@/lib/day-of-week";
import { hhmmToMinutesOr } from "@/lib/time-of-day";
import {
  filterSessionsByGroups,
  normalizeSessionType,
  resolveGroupSelections,
} from "@/lib/session-groups";

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

      // PERF (#31) — reuse the request-scoped full fetch and filter in memory
      // instead of a second identical `userCourse.findMany(include: course)`.
      // `invalidatePlanData` invalidates this query alongside getUserPlan /
      // getCredits / getGraduationScore / checkCompliance, and react-query
      // refetches them in ONE batched HTTP request = ONE tRPC context = ONE
      // loader. Before this, that single request ran the same join THREE times
      // (loader + here + getExamSchedule). The loader fetches ALL of the user's
      // courses; this semester's rows are a strict subset, so the result is
      // identical — same rows, same `include: { course: true }` shape.
      const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
      const allUserCourses = await loaders.userCoursesWithCourse(user.id);
      const userCourses = allUserCourses.filter(
        (uc) => uc.plannedYear === input.year && uc.plannedSemester === input.semester,
      );

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

      // Filter sessions by group, through the ONE shared rule
      // (`@/lib/session-groups`) that the planner grid and /calendar also run:
      // shared "ALL" meetings and single-group types always pass; a type with
      // several groups keeps the student's saved pick, or — when they never
      // picked — the first group code alphabetically.
      //
      // What changed and why (13.8): this used to return EVERY session of a
      // course with no saved selection. The planner drew one tutorial group and
      // the dashboard + calendar then drew all six, stacked — the week a student
      // approved was not the week they got. /calendar papered over it in the
      // browser with its own near-copy of the rule; the dashboard didn't, and
      // showed six "today's classes" for one course. Filtering here means every
      // consumer of this query agrees by construction.
      //
      // A default is NOT a decision, so it is never silently promoted to one:
      // nothing is written back to selectedGroups, and `defaultedGroups` below
      // tells the client exactly which types are still showing our fallback so
      // it can say so and offer the choice.
      const sessionsByCourse = new Map<string, typeof allSessions>();
      for (const s of allSessions) {
        const list = sessionsByCourse.get(s.courseCode);
        if (list) list.push(s);
        else sessionsByCourse.set(s.courseCode, [s]);
      }

      const keptIds = new Set<string>();
      const defaultedGroups: {
        courseCode: string;
        courseNameHe: string;
        sessionType: string;
        /** The group we're showing meanwhile. */
        keptGroup: string;
        options: {
          groupCode: string;
          meetings: { dayOfWeek: string; startTime: string; endTime: string }[];
        }[];
      }[] = [];

      for (const [courseCode, rows] of sessionsByCourse) {
        const selections = groupSelectionsByCode.get(courseCode);
        for (const kept of filterSessionsByGroups(rows, selections)) {
          keptIds.add(kept.id);
        }
        for (const resolved of resolveGroupSelections(rows, selections)) {
          if (resolved.chosen) continue;
          defaultedGroups.push({
            courseCode,
            courseNameHe: rows[0]?.course.nameHe ?? courseCode,
            sessionType: resolved.sessionType,
            keptGroup: resolved.groupCode,
            options: resolved.options.map((groupCode) => ({
              groupCode,
              meetings: rows
                .filter(
                  (r) =>
                    normalizeSessionType(r.sessionType) === resolved.sessionType &&
                    (r.groupCode ?? "A") === groupCode,
                )
                .map((r) => ({
                  dayOfWeek: String(r.dayOfWeek),
                  startTime: r.startTime,
                  endTime: r.endTime,
                })),
            })),
          });
        }
      }

      // Filter the ORIGINAL list so the day/time ordering the query asked for
      // survives.
      const sessions = allSessions.filter((s) => keptIds.has(s.id));

      return {
        sessions,
        courses: userCourses,
        defaultedGroups,
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
      // PERF (#31) — same request-scoped reuse as getScheduleForSemester above.
      // The loader already returns every row for the user, ordered by
      // plannedYear then plannedSemester, so filtering here reproduces the old
      // query exactly (the NOT clause = "not (COMPLETED and graded)") without a
      // third identical join in the invalidation batch.
      const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
      const allUserCourses = await loaders.userCoursesWithCourse(user.id);
      const userCourses = allUserCourses.filter((uc) => {
        if (uc.status === "COMPLETED" && uc.grade !== null) return false;
        if (input?.year && uc.plannedYear !== input.year) return false;
        if (input?.semester && uc.plannedSemester !== input.semester) return false;
        return true;
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
      env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")
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

      // Filter by group through the SAME shared rule as getScheduleForSemester —
      // Google Calendar must receive the week the student approved, not all six
      // tutorial groups of a course they never picked a group for.
      const byCourse = new Map<string, typeof allSessions>();
      for (const s of allSessions) {
        const list = byCourse.get(s.courseCode);
        if (list) list.push(s);
        else byCourse.set(s.courseCode, [s]);
      }
      const keepIds = new Set<string>();
      for (const [courseCode, rows] of byCourse) {
        for (const kept of filterSessionsByGroups(rows, groupSelectionsByCode.get(courseCode))) {
          keepIds.add(kept.id);
        }
      }
      const sessions = allSessions.filter((s) => keepIds.has(s.id));

      // Build pushable events from sessions
      const events: PushableEvent[] = [];

      // Semester teaching ranges — from THE academic-calendar module (verified
      // TAU dates), shared with the .ics export so both paths place classes on
      // identical dates. SUMMER isn't a teaching semester for PPE — use the
      // current year's summer-session window from the same module.
      const acadNow = getAcademicNow();
      const semesterDates: Record<string, { start: Date; end: Date }> = {
        FALL: getTeachingRange("FALL"),
        SPRING: getTeachingRange("SPRING"),
        // No summer term published and no known next start → an empty range,
        // which yields no sessions, rather than a range around a guessed date.
        SUMMER:
          acadNow.summer ??
          (acadNow.nextTeachingStart
            ? { start: acadNow.nextTeachingStart, end: acadNow.nextTeachingStart }
            : { start: new Date(0), end: new Date(0) }),
      };

      const semRange = semesterDates[input.semester];

      // Helper: format date as RRULE UNTIL value (YYYYMMDDTHHMMSSZ)
      const formatUntil = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}${m}${day}T235959Z`;
      };

      // Build lecture/tutorial events (skip if user chose exams-only)
      for (const session of (input.contentFilter === "exams" ? [] : sessions)) {
        // One HH:MM parser (lib/time-of-day) with an EXPLICIT fallback — a
        // garbage time used to reach setHours as NaN and push an Invalid Date
        // to Google Calendar. Defaults are this route's historical 09:00/10:00.
        const startMin = hhmmToMinutesOr(session.startTime, 9 * 60);
        const endMin = hhmmToMinutesOr(session.endTime, 10 * 60);

        // Find the first occurrence of this day within the semester
        // The COMPLETE day map (lib/day-of-week). The local copy stopped at
        // FRIDAY, so a SATURDAY row fell through `?? 0` and was pushed to
        // Google Calendar as a SUNDAY event — a wrong day, not a missing one.
        const targetDay = dayOfWeekIndex(session.dayOfWeek) ?? 0;
        const baseDate = semRange ? new Date(semRange.start) : new Date();
        const baseDay = baseDate.getDay();
        const daysUntil =
          targetDay >= baseDay
            ? targetDay - baseDay
            : 7 - (baseDay - targetDay);

        const startDate = new Date(baseDate);
        startDate.setDate(startDate.getDate() + daysUntil);
        startDate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);

        const endDate = new Date(startDate);
        endDate.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);

        const courseName =
          session.course?.nameHe ?? session.courseCode;

        // Build recurrence rule bounded to semester end
        // ONE label source (lib/group-options), shared with the .ics download so
        // a pushed event and a downloaded one never name the same meeting
        // differently (deferred-3). It is case-insensitive, so the duplicated
        // upper/lower keys this router used to carry are gone.
        const typeLabel = sessionTypeNameFor(session.sessionType || "lecture", true);
        const recurrenceRule = semRange
          ? `RRULE:FREQ=WEEKLY;UNTIL=${formatUntil(semRange.end)}`
          : "RRULE:FREQ=WEEKLY;COUNT=14";

        events.push({
          // ScheduleSession ids are GLOBAL (shared by every student of a course),
          // and CalendarEvent.id is the primary key — so a bare session.id here
          // let one student's sync overwrite another's Google-event mapping.
          // Namespace per user AND per year+semester so each student owns a
          // distinct row AND the stale-reconcile below can scope deletions to
          // THIS semester only (never wipe another semester's calendar). A user
          // who synced before this id-scheme change may see their events once
          // more on the next sync; "מחק אירועים מהיומן" clears the old rows.
          id: `lec-${user.id}-${input.year}-${input.semester}-${session.id}`,
          title: `${courseName} — ${typeLabel}`,
          description: [session.courseCode, session.lecturerName].filter(Boolean).join(" · "),
          startTime: startDate,
          endTime: endDate,
          // Building + room (note #14) — room alone ("011") is useless on campus.
          location: [session.building, session.room].filter(Boolean).join(", ") || undefined,
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
            id: `exam-a-${input.year}-${input.semester}-${uc.id}`,
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
            id: `exam-b-${input.year}-${input.semester}-${uc.id}`,
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

      // Persist googleEventIds in CalendarEvent table for future updates/deletes.
      // Each upsert is guarded: one failed mapping must NOT abort the rest, or
      // those events keep no local googleEventId and get re-inserted (duplicated)
      // on the next sync with no local record to clean them up (#audit-r2).
      let persisted = 0;
      for (const [localId, googleId] of idMap) {
        const matchingEvent = events.find((e) => e.id === localId);
        if (!matchingEvent) continue;
        try {
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
          persisted += 1;
        } catch (e) {
          console.error(`Failed to persist calendar mapping for ${localId}:`, e);
        }
      }

      // Reconcile removals: a course dropped from the plan since the last sync
      // still has its lecture/exam sitting on the student's real calendar. Any
      // previously-synced event whose id is NOT in the current payload is stale —
      // take it off Google and drop its local row. Without this, dropped classes
      // linger forever and the only escape is the all-or-nothing "מחק אירועים".
      //
      // CRITICAL scope guard: only ever delete events that belong to THIS sync's
      // scope — same year+semester AND the content categories this run actually
      // rebuilt. The id encodes {year}-{semester}, so we match by prefix. This
      // must NOT delete (a) another semester's events, (b) the other content
      // category when the user syncs lectures-only / exams-only, or (c) the
      // user's own personal Google events pulled in as GOOGLE_SYNCED rows (UUID
      // ids, no lec-/exam- prefix). Getting this wrong wipes real calendar data.
      const currentIds = new Set(events.map((e) => e.id));
      const scope = `${input.year}-${input.semester}-`;
      const lecPrefix = `lec-${user.id}-${scope}`;
      const examPrefixA = `exam-a-${scope}`;
      const examPrefixB = `exam-b-${scope}`;
      const reconcilesLectures = input.contentFilter !== "exams"; // this run built lectures
      const reconcilesExams = input.contentFilter !== "lectures"; // this run built exams
      const inReconcileScope = (id: string) =>
        (reconcilesLectures && id.startsWith(lecPrefix)) ||
        (reconcilesExams && (id.startsWith(examPrefixA) || id.startsWith(examPrefixB)));
      const staleGoogleIds = existingCalEvents
        .filter((e) => e.googleEventId && inReconcileScope(e.id) && !currentIds.has(e.id))
        .map((e) => e.googleEventId!)
        .filter((id): id is string => id !== null);

      let removed = 0;
      if (staleGoogleIds.length > 0) {
        // A failed Google delete keeps its local row so the next sync retries —
        // never orphan an event on the calendar with no record left (#audit-r2).
        const deletedStale = await withTokenRefresh(ctx.userId!, (calendar) =>
          deleteEventsFromGoogle(calendar, staleGoogleIds),
        );
        if (deletedStale.length > 0) {
          await ctx.db.calendarEvent.deleteMany({
            where: { userId: user.id, googleEventId: { in: deletedStale } },
          });
          removed = deletedStale.length;
        }
      }

      return { synced: persisted, removed };
    }),

  /**
   * Delete all synced events from Google Calendar and local DB.
   */
  deleteGoogleEvents: protectedProcedure.mutation(async ({ ctx }) => {
    const user = ctx.user; // enforceAuth already loaded the row (#9: no refetch)

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

    // Delete from Google, capturing exactly which IDs actually came off the
    // calendar (or were already gone).
    let deletedIds: string[] = [];
    if (googleIds.length > 0) {
      deletedIds = await withTokenRefresh(ctx.userId!, (calendar) =>
        deleteEventsFromGoogle(calendar, googleIds),
      );
    }

    // Remove ONLY the local rows whose Google delete succeeded — a failed delete
    // keeps its row so the event isn't orphaned on the real calendar with no
    // local record left to retry the deletion (#audit-r2).
    if (deletedIds.length > 0) {
      await ctx.db.calendarEvent.deleteMany({
        where: { userId: user.id, googleEventId: { in: deletedIds } },
      });
    }

    // Surface a partial failure instead of pretending everything was cleaned.
    if (deletedIds.length < googleIds.length) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `נמחקו ${deletedIds.length} מתוך ${googleIds.length} אירועים — חלק נשארו ביומן. נסו שוב, או בדקו את חיבור היומן בהגדרות.`,
      });
    }

    return { deleted: deletedIds.length };
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

    // The events WE pushed (base RRULE ids). pullEventsFromGoogle expands
    // recurring lectures with singleEvents:true, so each pushed lecture comes
    // back as many dated instances whose ids are `{baseId}_{ts}` — none of which
    // match our stored base id, so a naive import would insert dozens of copies
    // of our own lectures. Skip any instance whose recurringEventId (or id-base)
    // is one we pushed; only genuinely external events are imported.
    const ourEvents = await ctx.db.calendarEvent.findMany({
      where: { userId: user.id, googleEventId: { not: null } },
      select: { googleEventId: true },
    });
    const ourGoogleIds = new Set(
      ourEvents.map((e) => e.googleEventId).filter((id): id is string => id !== null),
    );

    let imported = 0;

    for (const gEvent of googleEvents) {
      if (!gEvent.id || !gEvent.start?.dateTime || !gEvent.end?.dateTime) {
        continue;
      }

      // Don't re-import an event we pushed (base id, or a recurring instance
      // whose recurringEventId / `{baseId}_{ts}` id points back at our base).
      const idBase = gEvent.id.split("_")[0]!;
      if (
        ourGoogleIds.has(gEvent.id) ||
        (gEvent.recurringEventId && ourGoogleIds.has(gEvent.recurringEventId)) ||
        ourGoogleIds.has(idBase)
      ) {
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
