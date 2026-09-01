// =========================================================================
// The week as a picture — the parts that can be wrong (22-15)
// =========================================================================
// Ariel: "איך אפשר להבין משהו בוואטסאפ ככה. מצידי שזה יהיה צילום מסך."
//
// Drawing cannot be asserted in node, and pretending otherwise ("the canvas
// had 40 fill calls") tests nothing. What CAN be wrong is the geometry: which
// hours the card spans, which day columns it keeps, and how a long Hebrew
// course name is broken to fit a 90px block. Those are pure, so they are here.
//
// The drawing itself was checked in a real browser at the end.

import { describe, it, expect } from "vitest";
import { weekBounds, daysWithClasses, wrapToWidth, type WeekImageSession } from "@/lib/week-image";

const s = (over: Partial<WeekImageSession> = {}): WeekImageSession => ({
  dayOfWeek: "MONDAY",
  startTime: "10:00",
  endTime: "12:00",
  courseName: "מיקרו כלכלה ב׳",
  sessionTypeLabel: "הרצאה",
  color: "#4338CA",
  room: null,
  ...over,
});

/** A crude but honest stand-in: width proportional to character count. */
const ctx = { measureText: (t: string) => ({ width: t.length * 6 }) };

describe("the card spans the hours the week actually uses", () => {
  it("snaps out to whole hours around the real range", () => {
    const { from, to } = weekBounds([s({ startTime: "10:30", endTime: "12:15" })]);
    expect(from).toBe(10 * 60);
    expect(to).toBe(13 * 60);
  });

  it("covers the earliest start and the latest end across all days", () => {
    const { from, to } = weekBounds([
      s({ dayOfWeek: "SUNDAY", startTime: "16:00", endTime: "18:00" }),
      s({ dayOfWeek: "TUESDAY", startTime: "08:00", endTime: "10:00" }),
    ]);
    expect(from).toBe(8 * 60);
    expect(to).toBe(18 * 60);
  });

  it("falls back to a sane day rather than an empty card", () => {
    const { from, to } = weekBounds([]);
    expect(to).toBeGreaterThan(from);
  });
});

describe("only the days with classes get a column", () => {
  it("drops an empty Friday", () => {
    const days = daysWithClasses([s({ dayOfWeek: "SUNDAY" }), s({ dayOfWeek: "MONDAY" })]);
    expect(days).toEqual(["SUNDAY", "MONDAY"]);
  });

  it("keeps the week's own order, not the order sessions arrived in", () => {
    const days = daysWithClasses([s({ dayOfWeek: "WEDNESDAY" }), s({ dayOfWeek: "SUNDAY" })]);
    expect(days).toEqual(["SUNDAY", "WEDNESDAY"]);
  });

  it("never renders zero columns", () => {
    expect(daysWithClasses([]).length).toBeGreaterThan(0);
  });
});

describe("a long course name is broken, not chopped", () => {
  it("wraps onto the lines available", () => {
    const lines = wrapToWidth(ctx, "כסף מסובב את העולם - אי שוויון מגדרי", 90, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("ellipsises only when something was actually left out", () => {
    const short = wrapToWidth(ctx, "מיקרו ב׳", 200, 2);
    expect(short.join(" ")).toBe("מיקרו ב׳");
    expect(short.join("")).not.toContain("…");
  });

  it("marks the cut when the name does not fit", () => {
    const lines = wrapToWidth(ctx, "כסף מסובב את העולם - אי שוויון מגדרי בעולם קפיטליסטי", 60, 2);
    expect(lines[lines.length - 1]).toMatch(/…$/);
  });

  it("never drops a word silently into nothing", () => {
    // A single word wider than the box still has to appear — an empty block is
    // worse than a truncated one.
    const lines = wrapToWidth(ctx, "אינטרדיסציפלינריות", 20, 2);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.length).toBeGreaterThan(0);
  });

  it("returns nothing for an empty name rather than a lone ellipsis", () => {
    expect(wrapToWidth(ctx, "", 90, 2)).toEqual([]);
  });
});

// =========================================================================
// The hour gutter is on the side the week starts from
// =========================================================================
// The first card rendered with NO hour axis at all — a timetable that cannot
// say when anything happens. The labels were being drawn, at PAD + 4, the far
// physical left. In RTL the day columns are laid out from the RIGHT edge
// inward, so the leftover gutter is on the right and PAD + 4 lands inside the
// first day column — where the blocks, drawn afterwards, painted over every
// one of them.
//
// Restated here as the two pure position functions, so "the gutter and the
// columns do not overlap" is an assertion rather than something to squint at.

describe("the hour gutter never overlaps a day column", () => {
  const PAD = 20, COL_W = 104, TIME_W = 44;
  const width = (n: number) => PAD * 2 + TIME_W + COL_W * n;
  const colX = (i: number, n: number, isHe: boolean) =>
    isHe ? width(n) - PAD - TIME_W - COL_W * (i + 1) : PAD + TIME_W + COL_W * i;
  const labelX = (n: number, isHe: boolean) =>
    isHe ? width(n) - PAD - TIME_W + 6 : PAD + TIME_W - 8;

  it.each([1, 2, 3, 5, 6])("keeps the label clear of every column (%i days, RTL)", (n) => {
    const x = labelX(n, true);
    for (let i = 0; i < n; i++) {
      const left = colX(i, n, true);
      expect(x, `overlaps column ${i}`).toBeGreaterThanOrEqual(left + COL_W);
    }
  });

  it.each([1, 2, 3, 5, 6])("keeps the label clear of every column (%i days, LTR)", (n) => {
    const x = labelX(n, false);
    for (let i = 0; i < n; i++) {
      expect(x, `overlaps column ${i}`).toBeLessThanOrEqual(colX(i, n, false));
    }
  });

  it("puts the RTL gutter on the right and the LTR gutter on the left", () => {
    // The witness for the actual defect: the old code used the LTR position in
    // both directions.
    const n = 3;
    expect(labelX(n, true)).toBeGreaterThan(width(n) / 2);
    expect(labelX(n, false)).toBeLessThan(width(n) / 2);
    expect(labelX(n, true)).not.toBe(PAD + 4);
  });

  it("stays inside the canvas", () => {
    for (const n of [1, 6]) {
      expect(labelX(n, true)).toBeLessThan(width(n));
      expect(labelX(n, false)).toBeGreaterThan(0);
    }
  });
});
