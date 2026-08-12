import { describe, it, expect } from "vitest";
import {
  getBiddingPhase,
  isBiddingRelevant,
  BIDDING_ROUNDS_5787,
  BIDDING_MILESTONES_5787,
} from "@/lib/bidding-calendar";

// The dates below are quoted from the two official תשפ״ז documents Ariel
// exported (13.8.2026). A wrong deadline here is the most expensive error the
// app can make — a student would miss registration entirely — so every
// boundary is pinned.
const R1 = BIDDING_ROUNDS_5787[0]!;
const R2 = BIDDING_ROUNDS_5787[1]!;
/** Israel local (UTC+3 in Sep/Oct). */
const il = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h - 3, min));

describe("bidding calendar — תשפ״ז dates match the official documents", () => {
  it("round 1: 7.9.26 11:00 → 15.9.26 10:00, results 16.9.26", () => {
    expect(R1.opens.toISOString()).toBe(il(2026, 9, 7, 11).toISOString());
    expect(R1.closes.toISOString()).toBe(il(2026, 9, 15, 10).toISOString());
    expect(R1.results.toISOString()).toBe(il(2026, 9, 16, 12).toISOString());
  });

  it("round 2: 23.9.26 11:00 → 5.10.26 10:00, results 6.10.26", () => {
    expect(R2.opens.toISOString()).toBe(il(2026, 9, 23, 11).toISOString());
    expect(R2.closes.toISOString()).toBe(il(2026, 10, 5, 10).toISOString());
    expect(R2.results.toISOString()).toBe(il(2026, 10, 6, 12).toISOString());
  });

  it("year starts 18.10.26 and the cancel window closes 29.10.26 23:59", () => {
    expect(BIDDING_MILESTONES_5787.yearStarts.toISOString()).toBe(il(2026, 10, 18, 0).toISOString());
    expect(BIDDING_MILESTONES_5787.cancelWindowEnd.toISOString()).toBe(il(2026, 10, 29, 23, 59).toISOString());
  });
});

describe("getBiddingPhase — which phase the student is in", () => {
  it("well before round 1 → 'before', counting down to the opening", () => {
    const p = getBiddingPhase(il(2026, 9, 1, 9));
    expect(p.kind).toBe("before");
    expect(p.round).toBe(1);
    expect(p.daysUntil).toBe(6);
  });

  it("the hour round 1 opens → 'open' (boundary is inclusive)", () => {
    const p = getBiddingPhase(R1.opens);
    expect(p.kind).toBe("open");
    expect(p.round).toBe(1);
  });

  it("one minute before round 1 closes is still 'open' — the deadline is exact", () => {
    const p = getBiddingPhase(new Date(R1.closes.getTime() - 60_000));
    expect(p.kind).toBe("open");
    expect(p.deadline?.toISOString()).toBe(R1.closes.toISOString());
  });

  it("the moment round 1 closes → 'awaiting-results', NOT still open", () => {
    const p = getBiddingPhase(R1.closes);
    expect(p.kind).toBe("awaiting-results");
    expect(p.round).toBe(1);
  });

  it("after round-1 results, before round 2 → 'between-rounds' pointing at round 2", () => {
    const p = getBiddingPhase(il(2026, 9, 20, 12));
    expect(p.kind).toBe("between-rounds");
    expect(p.round).toBe(2);
    expect(p.deadline?.toISOString()).toBe(R2.opens.toISOString());
  });

  it("during round 2 → 'open' on round 2", () => {
    const p = getBiddingPhase(il(2026, 9, 30, 12));
    expect(p.kind).toBe("open");
    expect(p.round).toBe(2);
  });

  it("after round-2 results → 'done', no deadline", () => {
    const p = getBiddingPhase(il(2026, 10, 20, 12));
    expect(p.kind).toBe("done");
    expect(p.daysUntil).toBeNull();
    expect(p.deadline).toBeUndefined();
  });
});

describe("isBiddingRelevant — don't nag in the off-season", () => {
  it("is quiet in March, months before the window", () => {
    expect(isBiddingRelevant(il(2026, 3, 1, 12))).toBe(false);
  });
  it("wakes up as the window approaches", () => {
    expect(isBiddingRelevant(il(2026, 9, 1, 12))).toBe(true);
  });
  it("stays on while a round is open", () => {
    expect(isBiddingRelevant(il(2026, 9, 10, 12))).toBe(true);
  });
  it("goes quiet once both rounds are done", () => {
    expect(isBiddingRelevant(il(2026, 10, 20, 12))).toBe(false);
  });
});
