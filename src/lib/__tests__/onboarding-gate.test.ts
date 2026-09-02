// =========================================================================
// #2 — "כל המערכת התאפסה ופתאום האפליקציה אמרה לי שעשיתי רק 5 אחוז"
// =========================================================================
// Two faults met to produce that. The navigation half — a locale-less link
// forcing a full page reload — is pinned in locale-aware-links.test.ts. This is
// the half that made the reload DESTRUCTIVE.
//
// The dashboard decided "this is a new student, show the wizard" from:
//     planQuery.isSuccess && !hasPlanData
// An empty array is a SUCCESS. Anything that produced one for an existing
// student — a cold read, a race right after a reload, a cache that had not
// filled — dropped them at step one of onboarding, whose defaults are year 1
// semester A. Finishing it writes a fresh, nearly-empty history over the real
// one: the reset he watched, and the 5% he was shown.
//
// The gate is restated here as the predicate it is, because the real one lives
// inline in a 900-line component and this is the part that must never drift.

import { describe, it, expect } from "vitest";

interface GateInput {
  planSucceeded: boolean;
  hasPlanData: boolean;
  isTransitioning: boolean;
  forceDashboard: boolean;
  profileSucceeded: boolean;
  startYear: number | null | undefined;
}

/** Exactly what dashboard-content.tsx decides. */
function showsWizard(i: GateInput): boolean {
  const knowsWhetherNew = i.profileSucceeded;
  const isGenuinelyNew = knowsWhetherNew && i.startYear == null;
  return (
    i.planSucceeded && !i.hasPlanData && !i.isTransitioning && !i.forceDashboard && isGenuinelyNew
  );
}

/** The version that shipped, kept as the witness. */
function oldGate(i: GateInput): boolean {
  return i.planSucceeded && !i.hasPlanData && !i.isTransitioning && !i.forceDashboard;
}

const BRAND_NEW: GateInput = {
  planSucceeded: true,
  hasPlanData: false,
  isTransitioning: false,
  forceDashboard: false,
  profileSucceeded: true,
  startYear: null,
};

// A year-2 student whose plan query came back empty for any reason at all.
const EXISTING_EMPTY_READ: GateInput = { ...BRAND_NEW, startYear: 2025 };

describe("only a genuinely new student is offered onboarding", () => {
  it("offers it to someone with no start year on file", () => {
    expect(showsWizard(BRAND_NEW)).toBe(true);
  });

  it("NEVER offers it to a student who already has one", () => {
    // The bug. The old gate said yes here, and finishing the wizard overwrote
    // a real degree with an empty one.
    expect(oldGate(EXISTING_EMPTY_READ)).toBe(true);
    expect(showsWizard(EXISTING_EMPTY_READ)).toBe(false);
  });

  it("does not decide before the profile has landed", () => {
    // undefined startYear from an unresolved query looks exactly like "new".
    // Until we have actually looked, the answer is no.
    expect(
      showsWizard({ ...BRAND_NEW, profileSucceeded: false, startYear: undefined }),
    ).toBe(false);
  });

  it("still stays away while the post-onboarding transition is running", () => {
    expect(showsWizard({ ...BRAND_NEW, isTransitioning: true })).toBe(false);
  });

  it("stays away once the student has forced the dashboard", () => {
    expect(showsWizard({ ...BRAND_NEW, forceDashboard: true })).toBe(false);
  });

  it("stays away whenever the plan actually has courses", () => {
    expect(showsWizard({ ...BRAND_NEW, hasPlanData: true })).toBe(false);
  });

  it("stays away while the plan query has not succeeded", () => {
    expect(showsWizard({ ...BRAND_NEW, planSucceeded: false })).toBe(false);
  });
});
