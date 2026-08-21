// =========================================================================
// The first-week checklist — ticked from what the student actually did
// =========================================================================
// Ariel asked for a checklist that makes the first week feel like progress
// rather than a wall. The version we had was three links that never changed:
// it said "add your past grades" with the same emphasis on day one and on day
// thirty, to someone who had already added forty of them. A list that cannot
// be completed is not a checklist, it is a nag.
//
// So every item here is derived from real data. Nothing is stored, nothing is
// self-reported, and a step ticks the moment the underlying thing is true.
// That also means it can tick itself the first time a student opens the app
// with a plan already imported — which is correct. Credit for work already
// done is not something to withhold to make a progress bar look busier.
//
// FOUR steps, not five. "Set up your timetable" was drafted as a step and cut:
// the weekly timetable is DERIVED from the courses in the plan, so it is not
// an action a student takes, and a step that completes itself the moment
// another one does teaches the reader that the list is decorative.
//
// Deliberately not gamified beyond a count: no points, no streaks, no badges.
// The reward for filling in your degree is an accurate degree, and inventing a
// currency on top of a tool students use under real pressure would cheapen it.

export interface GettingStartedInput {
  /** Courses in the student's plan, past and planned. */
  courseCount: number;
  /** How many carry a grade — i.e. the academic record has real history. */
  gradedCount: number;
  /** Whether a focus area was chosen — the degree cannot be checked without it. */
  hasFocusArea: boolean;
  /** Whether the compliance check actually returned a result. */
  hasRegulationResult: boolean;
}

export interface GettingStartedStep {
  /** Stable id — the React key, and how a test names a step. */
  id: "plan" | "record" | "focus" | "regulations";
  href: string;
  done: boolean;
}

/**
 * The four things that make the rest of the app work, ordered so each one
 * makes the next worth doing: courses, then history, then a focus area, then
 * the degree check that depends on all three.
 */
export function gettingStartedSteps(input: GettingStartedInput): GettingStartedStep[] {
  return [
    { id: "plan", href: "/planner", done: input.courseCount > 0 },
    { id: "record", href: "/record", done: input.gradedCount > 0 },
    { id: "focus", href: "/record", done: input.hasFocusArea },
    // The regulation check needs a focus area to mean anything — without one
    // it cannot report on the 60 ש״ס requirement, so it is not "done".
    { id: "regulations", href: "/regulations", done: input.hasRegulationResult && input.hasFocusArea },
  ];
}

export interface GettingStartedProgress {
  steps: GettingStartedStep[];
  done: number;
  total: number;
  /** The next thing worth doing, or null when everything is done. */
  next: GettingStartedStep | null;
  /** True once every step is done — the card should retire itself. */
  complete: boolean;
}

export function gettingStartedProgress(input: GettingStartedInput): GettingStartedProgress {
  const steps = gettingStartedSteps(input);
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    next: steps.find((s) => !s.done) ?? null,
    complete: done === steps.length,
  };
}
