import { describe, it, expect } from "vitest";
import { resolveExamDates, futureOnly } from "../exam-date-source";

const NOW = new Date("2026-08-21T10:00:00Z");
const d = (s: string) => new Date(`${s}T09:00:00Z`);
const NONE = { catalogA: null, catalogB: null, yedionA: null, yedionB: null, manual: null };

describe("resolveExamDates", () => {
  it("prefers the ידיעון over a stale catalog date — the bug Ariel found", () => {
    // Our catalog holds תשפ״ו; the ידיעון holds תשפ״ז. Preferring the catalog
    // nulled the sitting (already past) and the course vanished from the
    // planner with no message at all.
    const r = resolveExamDates(
      { ...NONE, catalogA: d("2026-02-06"), yedionA: d("2027-01-28") },
      NOW,
    );
    expect(r.examDateA).toEqual(d("2027-01-28"));
    expect(r.sourceA).toBe("yedion");
  });

  it("a stale higher-priority source never masks a usable lower one", () => {
    // This is the whole failure mode: filter for future FIRST, then rank.
    const r = resolveExamDates(
      { ...NONE, yedionA: d("2026-01-01"), catalogA: d("2026-12-01") },
      NOW,
    );
    expect(r.examDateA).toEqual(d("2026-12-01"));
    expect(r.sourceA).toBe("catalog");
  });

  it("still uses the catalog when the ידיעון has nothing", () => {
    const r = resolveExamDates({ ...NONE, catalogA: d("2026-12-01") }, NOW);
    expect(r.examDateA).toEqual(d("2026-12-01"));
    expect(r.sourceA).toBe("catalog");
  });

  it("uses a typed date only when nothing published applies", () => {
    expect(resolveExamDates({ ...NONE, manual: d("2026-12-05") }, NOW).sourceA).toBe("manual");
    // A published sitting must not be overridden by an older manual entry.
    const r = resolveExamDates(
      { ...NONE, yedionA: d("2027-01-28"), manual: d("2026-12-05") },
      NOW,
    );
    expect(r.sourceA).toBe("yedion");
  });

  it("reports nothing rather than a past date", () => {
    const r = resolveExamDates({ ...NONE, catalogA: d("2026-02-06") }, NOW);
    expect(r.examDateA).toBeNull();
    expect(r.sourceA).toBeNull();
  });

  it("resolves מועד ב׳ on the same terms", () => {
    const r = resolveExamDates(
      { ...NONE, catalogB: d("2026-03-01"), yedionB: d("2027-03-05") },
      NOW,
    );
    expect(r.examDateB).toEqual(d("2027-03-05"));
  });

  it("keeps a sitting happening today", () => {
    // An exam later today is still ahead of the student.
    expect(futureOnly(d("2026-08-21"), NOW)).not.toBeNull();
    expect(futureOnly(d("2026-08-20"), NOW)).toBeNull();
  });
});
