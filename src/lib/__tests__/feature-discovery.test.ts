import { describe, it, expect } from "vitest";
import { featureDiscovery, triedCount, type FeatureDiscoveryInput } from "@/lib/feature-discovery";

const base: FeatureDiscoveryInput = {
  daysToBidding: null,
  daysToNearestExam: null,
  hasStudyPlan: false,
  hasCohortContribution: false,
  calendarConnected: false,
  hasAnyGrade: true,
  isReservist: false,
};

const ids = (i: Partial<FeatureDiscoveryInput> = {}) =>
  featureDiscovery({ ...base, ...i }).map((e) => e.id);

describe("featureDiscovery — ordered by the calendar, not by our enthusiasm", () => {
  it("leads with bidding when the round is days away", () => {
    // 1.9.2026: the round opens on the 7th. For that fortnight nothing else
    // is the most useful thing to tell a student about.
    expect(ids({ daysToBidding: 6 })[0]).toBe("bidding");
  });

  it("does not mention bidding at all out of season", () => {
    // Not greyed out — gone. A row a student cannot act on still costs a line
    // of attention and teaches nothing.
    expect(ids({ daysToBidding: null })).not.toContain("bidding");
    expect(ids({ daysToBidding: 90 })).not.toContain("bidding");
  });

  it("leads with the exam planner when exams are the near thing", () => {
    expect(ids({ daysToNearestExam: 20 })[0]).toBe("examPlanner");
  });

  it("puts the closer deadline first when both are live", () => {
    expect(ids({ daysToBidding: 6, daysToNearestExam: 30 })[0]).toBe("bidding");
    expect(ids({ daysToBidding: 20, daysToNearestExam: 3 })[0]).toBe("examPlanner");
  });

  it("sinks what the student has already used", () => {
    const withTried = featureDiscovery({ ...base, calendarConnected: true, hasCohortContribution: false });
    const cohort = withTried.findIndex((e) => e.id === "cohort");
    const calendar = withTried.findIndex((e) => e.id === "calendarSync");
    expect(cohort).toBeLessThan(calendar);
  });
});

describe("a tick must mean something", () => {
  it("never claims to know about a feature that leaves no trace", () => {
    // We do not log screen views. The King and the lineage have nothing to
    // read, so they carry null — rendered as no tick, never as a cross.
    const entries = featureDiscovery(base);
    expect(entries.find((e) => e.id === "king")!.tried).toBeNull();
    expect(entries.find((e) => e.id === "lineage")!.tried).toBeNull();
  });

  it("ticks the exam planner only once a study plan really exists", () => {
    expect(featureDiscovery({ ...base, hasStudyPlan: false }).find((e) => e.id === "examPlanner")!.tried).toBe(false);
    expect(featureDiscovery({ ...base, hasStudyPlan: true }).find((e) => e.id === "examPlanner")!.tried).toBe(true);
  });

  it("counts only what is knowable, so the ratio is honest", () => {
    // 3 knowable entries (exam planner, cohort, calendar) — not 7. A progress
    // line that counted the untrackable ones could never reach its own total.
    const entries = featureDiscovery({ ...base, calendarConnected: true });
    const { tried, knowable } = triedCount(entries);
    expect(knowable).toBe(3);
    expect(tried).toBe(1);
  });
});

describe("entries a student cannot use are not offered", () => {
  it("hides the simulator until there is a grade to simulate", () => {
    expect(ids({ hasAnyGrade: false })).not.toContain("simulator");
    expect(ids({ hasAnyGrade: true })).toContain("simulator");
  });

  it("offers the miluim screen only to a reservist", () => {
    expect(ids({ isReservist: false })).not.toContain("miluim");
    expect(ids({ isReservist: true })).toContain("miluim");
  });
});
