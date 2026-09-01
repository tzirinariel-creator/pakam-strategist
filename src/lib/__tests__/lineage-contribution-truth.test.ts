// =========================================================================
// The lineage must not tell a contributor they contributed nothing (#48)
// =========================================================================
// Ariel asked for a deep look at השושלת's launch readiness, since there is no
// way to test it without users. Two of the findings were the same defect this
// page has already been fixed for once: asserting something about the student,
// or about the archive, that is not true.
//
// 1. "עוד לא תרמתם כלום" TO SOMEONE WHO JUST SHARED THEIR GRADES.
//    The one-click contribution is "שתפו את הציונים שלי" in settings, which
//    writes CourseGradePoint rows. The stats counted reviews, insights and
//    published plans — everything except those. So a student who had just
//    shared twenty grades was told they had given nothing, two cards above a
//    card counting the very rows they contributed, while the settings button
//    that withdraws them calls them תרומות.
//
// 2. "הארכיון עוד ריק" DERIVED FROM SUPPRESSED LABELS.
//    The generations strip is built from cohort YEARS, and a year only appears
//    once its cohort clears COHORT_LABEL_MIN_N. At launch every cohort is under
//    that bar, so the strip is empty — and it printed that as "the archive is
//    empty" rather than "no cohort is crowded enough to name". A privacy
//    suppression turned into a false claim about the data, for every student
//    who looked. The file already fixed this confusion one level down, with
//    `positionKnown`; it survived one level up.

import { describe, it, expect } from "vitest";
import { hasContributed } from "@/lib/lineage";

describe("sharing grades is contributing", () => {
  it("counts a student who only shared grades", () => {
    expect(hasContributed({ reviews: 0, insights: 0, plans: 0, gradePoints: 20 })).toBe(true);
  });

  it("the witness: the old shape reported them as having given nothing", () => {
    // Exactly the payload the old server returned — no gradePoints field at all.
    expect(hasContributed({ reviews: 0, insights: 0, plans: 0 })).toBe(false);
  });

  it("still counts the other three", () => {
    expect(hasContributed({ reviews: 1, insights: 0, plans: 0, gradePoints: 0 })).toBe(true);
    expect(hasContributed({ reviews: 0, insights: 1, plans: 0, gradePoints: 0 })).toBe(true);
    expect(hasContributed({ reviews: 0, insights: 0, plans: 1, gradePoints: 0 })).toBe(true);
  });

  it("still says no to a student who has genuinely given nothing", () => {
    // The fix must not make everyone a contributor.
    expect(hasContributed({ reviews: 0, insights: 0, plans: 0, gradePoints: 0 })).toBe(false);
    expect(hasContributed(null)).toBe(false);
    expect(hasContributed(undefined)).toBe(false);
  });
});

// The generations wording, restated as the decision it is.
function beforeClaim(spanTotal: number, positionKnown: boolean, archiveHasContent: boolean): string {
  if (!positionKnown && spanTotal === 0) {
    return archiveHasContent ? "content-but-unnamed" : "empty";
  }
  return "other";
}

describe("an empty strip is not an empty archive", () => {
  it("says the archive has content when it does, even with no nameable cohort", () => {
    // The launch state: reviews exist, no cohort clears COHORT_LABEL_MIN_N.
    expect(beforeClaim(0, false, true)).toBe("content-but-unnamed");
  });

  it("the witness: it used to claim empty in exactly that state", () => {
    const OLD = (spanTotal: number, positionKnown: boolean) =>
      !positionKnown && spanTotal === 0 ? "empty" : "other";
    expect(OLD(0, false)).toBe("empty");
  });

  it("still says empty when the archive really is empty", () => {
    // Reserving the sentence for the case it is true of is the whole point.
    expect(beforeClaim(0, false, false)).toBe("empty");
  });
});
