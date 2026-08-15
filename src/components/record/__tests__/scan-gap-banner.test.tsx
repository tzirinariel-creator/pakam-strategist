// @vitest-environment jsdom
// =========================================================================
// The banner that would have saved Ariel two wasted scans
// =========================================================================
// Twice, days apart, he scanned the same sheet and courses went missing while
// the screen looked like a clean success. This component is the fix: it says
// so out loud, above the fold, before he confirms — and it never fills the
// missing grade in for him, because a second read is not proof.
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScanGapBanner } from "@/components/record/scan-gap-banner";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

afterEach(cleanup);

const clean: ScanDiagnostics = {
  semesters: ["2025/1"], firstReadRows: 12, verifyReadRows: 12, verifyFailed: false,
  withGrade: 12, withoutGrade: 0, disputed: 0, rejectedRows: 0, censusFailed: false,
  missingRows: [], missingGrades: [],
};

const names: Record<string, string> = {
  "1031-4015": "דוגרי: אמת, אמון ואמנות בסכסוך הישראלי-פלסטיני",
  "1880-0901": "משבר האקלים וקיימות: מבט רב-תחומי",
  "1031-2108": "אסטרטגיה בעידן המודרני + תרגול",
};
const nameFor = (c: string) => names[c] ?? null;

describe("ScanGapBanner", () => {
  it("renders NOTHING when the census and the read agree", () => {
    const { container } = render(<ScanGapBanner d={clean} isHe />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the courses that never arrived — Ariel's exact two", () => {
    render(
      <ScanGapBanner
        d={{ ...clean, missingRows: [
          { courseCode: "1031-4015", grade: 93 },
          { courseCode: "1880-0901", grade: 94 },
        ]}}
        isHe
        courseNameFor={nameFor}
      />,
    );
    expect(screen.getByText(/בגיליון יש שורות שהקריאה לא החזירה/)).toBeInTheDocument();
    expect(screen.getByText(names["1031-4015"]!)).toBeInTheDocument();
    expect(screen.getByText(names["1880-0901"]!)).toBeInTheDocument();
  });

  it("falls back to the bare code when we have no catalog name", () => {
    render(<ScanGapBanner d={{ ...clean, missingRows: [{ courseCode: "2171-9201", grade: 90 }] }} isHe />);
    expect(screen.getAllByText("2171-9201").length).toBeGreaterThan(0);
  });

  it("reports a row that arrived with its grade stripped, and refuses to fill it", () => {
    render(
      <ScanGapBanner
        d={{ ...clean, missingGrades: [{ courseCode: "1031-2108", censusGrade: 90 }] }}
        isHe
        courseNameFor={nameFor}
      />,
    );
    expect(screen.getByText(names["1031-2108"]!)).toBeInTheDocument();
    // The honesty rail, stated to the student in words.
    expect(screen.getByText(/לא מילאנו את הציון בשבילכם בכוונה/)).toBeInTheDocument();
  });

  it("shows both kinds of gap at once", () => {
    render(
      <ScanGapBanner
        d={{
          ...clean,
          missingRows: [{ courseCode: "1031-4015", grade: 93 }],
          missingGrades: [{ courseCode: "1031-2108", censusGrade: 90 }],
        }}
        isHe
        courseNameFor={nameFor}
      />,
    );
    expect(screen.getByText(/קורסים שחסרים לגמרי/)).toBeInTheDocument();
    expect(screen.getByText(/בלי הציון שמודפס בגיליון/)).toBeInTheDocument();
  });

  it("renders in English", () => {
    render(<ScanGapBanner d={{ ...clean, missingRows: [{ courseCode: "1031-4015", grade: 93 }] }} isHe={false} />);
    expect(screen.getByText(/The sheet has rows the read didn't return/)).toBeInTheDocument();
  });

  it("tolerates a diagnostics object from an older deploy", () => {
    // Field-missing payloads must degrade to silence, not a crash.
    const legacy = { ...clean } as ScanDiagnostics & { missingRows?: unknown };
    delete (legacy as { missingRows?: unknown }).missingRows;
    delete (legacy as { missingGrades?: unknown }).missingGrades;
    expect(() => render(<ScanGapBanner d={legacy} isHe />)).not.toThrow();
  });
});
