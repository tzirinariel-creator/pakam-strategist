/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScanDiagnosticsPanel } from "../scan-diagnostics";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

afterEach(cleanup);

// Ariel's actual scan, from the screenshot he sent on 21.8.
const ARIEL: ScanDiagnostics = {
  semesters: ["2025/1", "2025/2"],
  firstReadRows: 20,
  verifyReadRows: 20,
  withGrade: 17,
  withoutGrade: 3,
  disputed: 0,
  verifyFailed: false,
  rejectedRows: 0,
  censusFailed: false,
  missingRows: [],
  missingGrades: [],
};

describe("ScanDiagnosticsPanel", () => {
  it("is named for the reason a student opens it", () => {
    // Nobody wonders "what did the scanner read". They wonder where their
    // course went. The old title was "מה הסורק קרא בפועל".
    render(<ScanDiagnosticsPanel d={ARIEL} isHe />);
    expect(screen.getByText(/חסר לכם קורס/)).toBeTruthy();
  });

  it("says the semesters in words, not as 2025/1", () => {
    const { container } = render(<ScanDiagnosticsPanel d={ARIEL} isHe />);
    expect(container.textContent).toContain("סמסטר א׳ · תשפ״ו");
    expect(container.textContent).toContain("סמסטר ב׳ · תשפ״ו");
    expect(container.textContent).not.toContain("2025/1");
  });

  it("hides the mechanics when the read was clean", () => {
    // "שורות בקריאה הראשונה: 20 / בקריאת האימות: 20 / לא הסכימו: 0" is a log
    // line. A number that cannot change what the reader does is not
    // information — Ariel: "לא מבין למה החלק הזה חשוב".
    const { container } = render(<ScanDiagnosticsPanel d={ARIEL} isHe />);
    expect(container.textContent).not.toMatch(/קריאת האימות|קריאה הראשונה/);
    expect(container.textContent).not.toMatch(/לא הסכימו/);
  });

  it("shows the mechanics exactly when they mean something", () => {
    const { container } = render(
      <ScanDiagnosticsPanel d={{ ...ARIEL, disputed: 2 }} isHe />,
    );
    expect(container.textContent).toMatch(/לא הסכימו עליהן/);
  });

  it("warns honestly when the verifying read did not run", () => {
    const { container } = render(
      <ScanDiagnosticsPanel d={{ ...ARIEL, verifyFailed: true }} isHe />,
    );
    expect(container.textContent).toMatch(/קריאה אחת/);
  });

  it("still gives the actionable advice, which is the point of the panel", () => {
    const { container } = render(<ScanDiagnosticsPanel d={ARIEL} isHe />);
    expect(container.textContent).toMatch(/PDF המלא/);
  });
});
