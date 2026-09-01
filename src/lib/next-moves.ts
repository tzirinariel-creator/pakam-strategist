// =========================================================================
// The one list. Ticked only by things the student actually did.
// =========================================================================
// Ariel, #5/#19/#21/#35, more often than any other note: a student finishes
// signing up and has still never seen the exam planner, never spoken to the
// advisor, never learned what the calendar sync is for — "יש סוג של משימות
// לסטודנט שהוא צריך להשלים שמרוכזות איפושהו?"
//
// There were THREE answers to that question running side by side on the
// dashboard, and they disagreed:
//   • getting-started.ts + welcome-home-card.tsx — four first-week chores,
//     shown only to `fromOnboarding || onboardingFlag || courseCount < 4`;
//   • feature-discovery.ts + feature-discovery-card.tsx — eight features, a
//     counter over rows the card never rendered, and one input hardcoded
//     `false` at the call site so it could never retire;
//   • the "הצעד הבא שלכם" quick-action row at the foot of dashboard-content,
//     which always rendered because it has a fallback action.
// This file replaces all three.
//
// FOUR RULES, and each one is a bug that shipped:
//
// 1. EVERY MOVE HAS A REAL TRACE. `done` is always a boolean read from the
//    database, never `null`, never a screen-view, never hardcoded. A feature
//    with nothing to read is not listed here at all — המכרז, סימולציית
//    הציונים, השושלת and המילואים have no trace, and each already owns a
//    dated card or a permanent bar of its own, so none of them is smuggled in
//    as a row that can never tick.
//
// 2. THE COUNT COUNTS THE ROWS ON SCREEN. The old card summed `tried` over
//    every entry and then rendered `entries.slice(0, 5)`, so it said "1/3"
//    while one of the three was below the cut. Here the card renders every
//    move it counts, so the two can never come apart.
//
// 3. IT RETIRES. `complete` goes true when the last move ticks and the card
//    returns null. The old one could not: `hasCohortContribution={false}` was
//    written at the call site, so `tried === knowable` was unreachable.
//
// 4. THE CALENDAR ORDERS IT, not our enthusiasm. Only a real published date
//    sets `dueInDays`: the bidding round (bidding-content.tsx builds its list
//    from the saved plan, so an unbuilt plan is what the round is waiting on)
//    and the nearest known exam. Nothing else invents urgency.
//
// No points, no badges, no streaks. The momentum is the list getting shorter.

export type MoveId =
  | "plan"
  | "grades"
  | "focus"
  | "examPlanner"
  | "advisor"
  | "calendarSync"
  | "cohort";

export interface NextMovesInput {
  /** Courses in the plan. Trace: plan.getUserPlan. */
  courseCount: number;
  /** Courses carrying a grade. Trace: plan.getUserPlan. */
  gradedCount: number;
  /** Trace: user.getProfile.focusArea. */
  hasFocusArea: boolean;
  /** Rows a generated exam plan wrote. Trace: studyTask.list. */
  studyTaskCount: number;
  /** Messages in the student's own chat sessions. Trace: ai.getChatSessions. */
  advisorMessageCount: number;
  /** Trace: schedule.getGoogleStatus.connected. */
  calendarConnected: boolean;
  /** Reviews + insights + shared plans + shared grade points.
   *  Trace: cohort.myContributionStats.total. */
  cohortContributions: number;
  /** Days until the bidding round opens or reopens; null out of season. */
  daysToBidding: number | null;
  /** Days until the nearest known exam; null when none is known. */
  daysToNearestExam: number | null;
}

export interface Move {
  id: MoveId;
  href: string;
  /** Read from a trace. Never null, never a screen-view, never a constant. */
  done: boolean;
  /** Set ONLY from a real published date. Absent means "no date, no urgency". */
  dueInDays?: number;
}

/** The round is the reason to finish a plan; outside this window it is noise. */
const BIDDING_WINDOW_DAYS = 21;
/** Past this, spreading revision over the remaining days is premature. */
const EXAM_WINDOW_DAYS = 45;

/**
 * Dependency order, used as the tie-break: a plan, then the history that gives
 * it meaning, then the focus area the compliance check needs, then the screens
 * that read all three. Each one makes the next worth doing.
 */
const BASE_ORDER: MoveId[] = [
  "plan",
  "grades",
  "focus",
  "examPlanner",
  "advisor",
  "calendarSync",
  "cohort",
];

export interface NextMovesResult {
  /** Every move, unfinished first, dated first within that. */
  moves: Move[];
  done: number;
  total: number;
  /** True once every move is done — the card must render nothing. */
  complete: boolean;
}

export function nextMoves(input: NextMovesInput): NextMovesResult {
  const moves: Move[] = [
    { id: "plan", href: "/planner", done: input.courseCount > 0 },
    { id: "grades", href: "/record", done: input.gradedCount > 0 },
    // The selector lives in settings/profile-section.tsx, not in the record.
    { id: "focus", href: "/settings", done: input.hasFocusArea },
    { id: "examPlanner", href: "/exam-planner", done: input.studyTaskCount > 0 },
    { id: "advisor", href: "/mentor", done: input.advisorMessageCount > 0 },
    // Google Calendar is connected from settings/google-calendar-section.tsx.
    // /calendar only DISPLAYS the calendar, which is where the old card sent
    // students who wanted to connect one.
    { id: "calendarSync", href: "/settings", done: input.calendarConnected },
    { id: "cohort", href: "/lineage", done: input.cohortContributions > 0 },
  ];

  // A published date, and nothing else, makes a move time-critical.
  if (input.daysToBidding != null && input.daysToBidding <= BIDDING_WINDOW_DAYS) {
    const plan = moves.find((m) => m.id === "plan")!;
    if (!plan.done) plan.dueInDays = input.daysToBidding;
  }
  if (input.daysToNearestExam != null && input.daysToNearestExam <= EXAM_WINDOW_DAYS) {
    const exams = moves.find((m) => m.id === "examPlanner")!;
    if (!exams.done) exams.dueInDays = input.daysToNearestExam;
  }

  const sorted = [...moves].sort((a, b) => {
    // Unfinished first: a finished row is a receipt, not an ask.
    if (a.done !== b.done) return a.done ? 1 : -1;
    // Then the nearest real deadline.
    const ad = a.dueInDays ?? Infinity;
    const bd = b.dueInDays ?? Infinity;
    if (ad !== bd) return ad - bd;
    // Then the order in which they make each other worth doing.
    return BASE_ORDER.indexOf(a.id) - BASE_ORDER.indexOf(b.id);
  });

  const done = sorted.filter((m) => m.done).length;
  return { moves: sorted, done, total: sorted.length, complete: done === sorted.length };
}
