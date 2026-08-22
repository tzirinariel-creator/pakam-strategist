import { describe, it, expect } from "vitest";
import { econometricsNote, ECONOMETRICS_CODE } from "@/lib/econometrics-note";

const row = (code: string, status = "PLANNED", plannedYear = 2) => ({ code, status, plannedYear });

describe("econometricsNote", () => {
  it("raises the note when the course is missing and there is still time", () => {
    const n = econometricsNote([row("1011-2101"), row("0651-1005")], 2);
    expect(n).not.toBeNull();
    expect(n!.currentYear).toBe(2);
  });

  it("goes quiet once the course is planned", () => {
    // A note that keeps talking after you acted on it teaches people to stop
    // reading notes.
    expect(econometricsNote([row(ECONOMETRICS_CODE)], 2)).toBeNull();
  });

  it("goes quiet once the course is completed", () => {
    expect(econometricsNote([row(ECONOMETRICS_CODE, "COMPLETED")], 3)).toBeNull();
  });

  it("matches the code with or without the dash", () => {
    // Scanned rows and catalog rows do not agree on the hyphen, and a note
    // that reappears for someone who already took the course is worse than
    // one that never appeared.
    expect(econometricsNote([row("10112116")], 2)).toBeNull();
  });

  it("still raises when a previous attempt was dropped or failed", () => {
    expect(econometricsNote([row(ECONOMETRICS_CODE, "DROPPED")], 3)).not.toBeNull();
    expect(econometricsNote([row(ECONOMETRICS_CODE, "FAILED")], 3)).not.toBeNull();
  });

  it("says nothing after year 3 — the window named by the secretariat has passed", () => {
    // Past the window it is not advice, it is a reproach about a decision that
    // can no longer be made.
    expect(econometricsNote([row("1011-2101")], 4)).toBeNull();
  });

  it("speaks to a first-year too", () => {
    // Year 1 is exactly when knowing this changes an elective choice.
    expect(econometricsNote([], 1)).not.toBeNull();
  });
});
