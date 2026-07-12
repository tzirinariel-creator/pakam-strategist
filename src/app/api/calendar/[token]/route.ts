// =========================================================================
// Personal calendar feed (retention hook #1) — GET .ics, stateless-auth.
// =========================================================================
// A student subscribes ONCE (webcal://…/api/calendar/<token>); their calendar
// re-fetches every ~12h and shows exam/Moed-B dates, "enter grades", and the
// next-semester milestone as events WITH day-before reminders. No push infra,
// no per-user DB token (the HMAC token authenticates statelessly).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCalendarFeedToken } from "@/lib/calendar-feed-token";
import { buildCalendarFeed, type FeedCourse } from "@/lib/calendar-feed";
import { getAcademicNow } from "@/lib/academic-calendar";
import { SEMESTER_CONFIG } from "@/lib/constants";

export const dynamic = "force-dynamic";

const GRADES_OPEN_DELAY_MS = 14 * 24 * 60 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // The token may arrive as "<id>.<sig>.ics" if the subscriber kept the
  // extension — strip a trailing .ics before verifying.
  const clean = token.replace(/\.ics$/i, "");
  const userId = verifyCalendarFeedToken(clean);
  if (!userId) {
    return new NextResponse("Invalid feed token", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return new NextResponse("Not found", { status: 404 });

  const rows = await prisma.userCourse.findMany({
    where: { userId },
    select: {
      status: true,
      grade: true,
      course: { select: { nameHe: true, code: true, examDateA: true, examDateB: true } },
    },
  });

  const courses: FeedCourse[] = rows.map((r) => ({
    nameHe: r.course.nameHe,
    code: r.course.code,
    examDateA: r.course.examDateA,
    examDateB: r.course.examDateB,
    status: r.status,
    grade: r.grade,
  }));

  const acad = getAcademicNow();
  const gradesOpenDate = acad.isStale ? null : new Date(acad.dates.teachingEnd.getTime() + GRADES_OPEN_DELAY_MS);
  const gradesSemesterLabelHe = SEMESTER_CONFIG[acad.semester]?.nameHe ?? null;

  const ics = buildCalendarFeed({
    courses,
    gradesOpenDate,
    gradesSemesterLabelHe,
    nextTeachingStart: acad.nextTeachingStart ?? null,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pakamon.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
