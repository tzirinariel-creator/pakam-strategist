// @vitest-environment jsdom
// =========================================================================
// 14.8 — "הוא לא קולט דברים": making a failed scan diagnosable
// =========================================================================
// Ariel uploaded his own grade sheet and courses he HAS grades for (English,
// דוגרי) came back without them. We could not answer him, because the vision
// model's raw output is never stored: "that page was never in the file",
// "the model misread the cell" and "our code dropped it" are indistinguishable
// from the outside.
//
// This panel reports the SHAPE of the read — no names, no grades — so the
// student can read it off the screen and tell us which of the three happened.
// The first row is the one that usually settles it: a course from year 1 can't
// be missing from a file that never covered year 1.
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { ScanDiagnosticsPanel } from "@/components/record/scan-diagnostics";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

afterEach(cleanup);

const base: ScanDiagnostics = {
  semesters: ["2024/1", "2024/2", "2025/1"],
  firstReadRows: 12,
  verifyReadRows: 12,
  verifyFailed: false,
  withGrade: 10,
  withoutGrade: 2,
  disputed: 0,
};

/** Read the panel's value for a given label — the row shape is a <dt>/<dd> pair. */
function valueFor(label: RegExp): string {
  const dt = screen.getByText(label);
  return dt.parentElement!.querySelector("dd")!.textContent!.trim();
}

describe("ScanDiagnosticsPanel", () => {
  it("lists the semesters the file covered — the answer to a missing old course", () => {
    render(<ScanDiagnosticsPanel d={base} isHe />);
    expect(valueFor(/הסמסטרים שהקובץ כיסה/)).toBe("2024/1, 2024/2, 2025/1");
  });

  it("says so plainly when no semester header was read at all", () => {
    render(<ScanDiagnosticsPanel d={{ ...base, semesters: [] }} isHe />);
    expect(valueFor(/הסמסטרים שהקובץ כיסה/)).toBe("לא זוהו");
  });

  it("reports the graded / ungraded split", () => {
    render(<ScanDiagnosticsPanel d={base} isHe />);
    expect(valueFor(/קורסים עם ציון/)).toBe("10");
    expect(valueFor(/קורסים בלי ציון/)).toBe("2");
  });

  it("warns when the verifying second read never ran", () => {
    // The verify pass is what catches a misread cell. When it dies (quota, a
    // network blip) the student is looking at a single unchecked read, and has
    // to be told — silence here is what made the original report unanswerable.
    render(
      <ScanDiagnosticsPanel
        d={{ ...base, verifyReadRows: null, verifyFailed: true }}
        isHe
      />,
    );
    expect(valueFor(/שורות בקריאת האימות/)).toBe("האימות לא רץ");
    expect(screen.getByText(/מבוסס על קריאה אחת בלבד/)).toBeInTheDocument();
  });

  it("shows no such warning on a healthy double read", () => {
    render(<ScanDiagnosticsPanel d={base} isHe />);
    expect(screen.queryByText(/קריאה אחת בלבד/)).not.toBeInTheDocument();
  });

  it("surfaces rows the two reads disagreed about", () => {
    render(<ScanDiagnosticsPanel d={{ ...base, disputed: 3 }} isHe />);
    expect(valueFor(/שתי הקריאות לא הסכימו/)).toBe("3");
  });

  it("carries no course name and no grade — only shapes", () => {
    // The panel is shown to the student, but it is also what they screenshot
    // and send us. Nothing identifying may ride along in it.
    const { container } = render(<ScanDiagnosticsPanel d={base} isHe />);
    expect(container.textContent).not.toMatch(/[0-9]{4}-[0-9]{4}/); // course codes
  });

  it("renders in English too", () => {
    const { container } = render(<ScanDiagnosticsPanel d={base} isHe={false} />);
    expect(within(container).getByText(/Semesters the file covered/)).toBeInTheDocument();
    expect(within(container).queryByText(/הסמסטרים/)).not.toBeInTheDocument();
  });

  it("is collapsed by default — a diagnostic, not part of the flow", () => {
    const { container } = render(<ScanDiagnosticsPanel d={base} isHe />);
    expect(container.querySelector("details")!.open).toBe(false);
  });
});
