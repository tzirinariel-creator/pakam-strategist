// =========================================================================
// The ידיעון's exam board — and the bug that hid it
// =========================================================================
// My first parser reported "the ידיעון publishes no exam dates, only day and
// time". That was wrong, and it was mine: the run-extraction regex was
// `<w:t[^>]*>`, which also matches `<w:tbl>`, `<w:tc>` and `<w:tcPr>` — every
// table tag starts with `<w:t`. The non-greedy body then swallowed whole spans
// of paragraph properties, and all 701 dates vanished inside them.
//
// Ariel caught it by opening the real page: "למה אחי? תסתכל המבנה.. יש תאריך".
// The first test below is the regression that makes that impossible to repeat.
import { describe, it, expect } from "vitest";
import { parseAssessments, tokensFromDocumentXml } from "../../../scripts/parse-yedion-assessments";
import { examSittingsFor, yedionExamDates, describeSitting, coverage } from "@/lib/yedion-assessments";

/** The 0618-1018 row, exactly as the .docx yields it. */
const EXAM_TOKENS = [
  "0618-1018", "מבוא", "לפילוסופיה", "של", "המוסר", "א", "01", "בחינה", "סופית",
  "א", "ב", "28/01/2027", "יום", "ה", "09:00", "05/03/2027", "יום", "ו", "09:00",
];

describe("tokensFromDocumentXml — the regex that hid 701 dates", () => {
  it("does NOT treat a table tag as a text run", () => {
    // THE regression. <w:tbl>/<w:tc>/<w:tcPr> all start with "<w:t".
    const xml = `<w:body><w:tbl><w:tr><w:tc><w:tcPr><w:shd w:fill="f5fbff"/></w:tcPr>` +
                `<w:p><w:r><w:t xml:space="preserve">28/01/2027 </w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body>`;
    expect(tokensFromDocumentXml(xml)).toEqual(["28/01/2027"]);
  });

  it("extracts runs in document order and unescapes entities", () => {
    const xml = `<w:body><w:r><w:t>0651-1007</w:t></w:r><w:r><w:t xml:space="preserve">לפכ&quot;מ</w:t></w:r></w:body>`;
    expect(tokensFromDocumentXml(xml)).toEqual(["0651-1007", 'לפכ"מ']);
  });
});

describe("exam rows carry BOTH sittings with real dates", () => {
  const [rec] = parseAssessments(EXAM_TOKENS);

  it("reads מועד א׳ and מועד ב׳ with their dates, days and times", () => {
    expect(rec!.sittings).toEqual([
      { sitting: "A", date: "2027-01-28", dayOfWeek: "THURSDAY", time: "09:00" },
      { sitting: "B", date: "2027-03-05", dayOfWeek: "FRIDAY", time: "09:00" },
    ]);
  });

  it("reads the course name, semester, group and assessment type", () => {
    expect(rec!.courseName).toBe("מבוא לפילוסופיה של המוסר");
    expect(rec!.semester).toBe("א");
    expect(rec!.group).toBe("01");
    expect(rec!.assessmentType).toBe("בחינה סופית");
  });

  it("never invents a third sitting", () => {
    const noisy = [...EXAM_TOKENS, "12/12/2027", "יום", "א", "10:00"];
    expect(parseAssessments(noisy)[0]!.sittings).toHaveLength(2);
  });
});

describe("paper rows carry a deadline, not sittings", () => {
  const PAPER = [
    "0651-1001", "קריאה", "מודרכת", "א", "כל", "הקבוצות",
    "עבודת", "בית", "א", "02/03/27", "יום", "ג",
  ];
  const [rec] = parseAssessments(PAPER);

  it("reads the deadline and expands a 2-digit year to 20xx", () => {
    expect(rec!.dueDate).toBe("2027-03-02");
    expect(rec!.sittings).toEqual([]);
  });

  it("reads 'כל הקבוצות' as the group", () => {
    expect(rec!.group).toBe("כל הקבוצות");
  });
});

describe("the shipped dataset", () => {
  it("covers the real catalog, not a handful of rows", () => {
    const c = coverage();
    expect(c.courses).toBeGreaterThan(200);
    expect(c.datedSittings).toBeGreaterThan(400);
    expect(c.deadlines).toBeGreaterThan(200);
  });

  it("matches Ariel's screenshot of the ידיעון, row for row", () => {
    // Six rows he photographed. If the parser drifts, these break first.
    const expected: Record<string, [string, string]> = {
      "0618-1018": ["2027-01-28", "2027-03-05"],
      "0618-1012": ["2027-02-11", "2027-03-19"],
      "0618-1019": ["2027-02-16", "2027-03-26"],
      "0618-1037": ["2027-07-02", "2027-08-06"],
      "0618-1032": ["2027-07-23", "2027-09-16"],
    };
    for (const [code, [a, b]] of Object.entries(expected)) {
      const s = examSittingsFor(code);
      expect(s.map((x) => x.date)).toEqual([a, b]);
    }
  });

  it("agrees with bid-it, an independent source, on מועד א׳", () => {
    // The student association's planner prints the same dates.
    const bidit: Record<string, string> = {
      "1011-2101": "2027-01-20", "1011-2109": "2027-01-27",
      "0618-2200": "2027-01-29", "1011-2106": "2027-02-01",
    };
    for (const [code, date] of Object.entries(bidit)) {
      expect(examSittingsFor(code)[0]?.date).toBe(date);
    }
  });

  it("hands the exam planner Date objects on the UTC calendar day", () => {
    const { examDateA, examDateB } = yedionExamDates("0618-1018");
    expect(examDateA?.toISOString().slice(0, 10)).toBe("2027-01-28");
    expect(examDateB?.toISOString().slice(0, 10)).toBe("2027-03-05");
  });

  it("returns nulls for a course the ידיעון says nothing about", () => {
    expect(yedionExamDates("9999-9999")).toEqual({ examDateA: null, examDateB: null });
    expect(examSittingsFor(null)).toEqual([]);
  });
});

describe("describeSitting", () => {
  it("reads as a sentence a student would say", () => {
    const [s] = examSittingsFor("0618-1018");
    expect(describeSitting(s!)).toBe("מועד א׳ · יום חמישי, 09:00");
  });

  it("degrades gracefully when the day or time is missing", () => {
    expect(describeSitting({ sitting: "B", date: "2027-01-01", dayOfWeek: null, time: null }))
      .toBe("מועד ב׳");
  });
});

describe("a sitting we did not really read", () => {
  it("never reports מועד ב׳ on the same day as מועד א׳", () => {
    // 1882-0301 parses with both sittings at 25.12.2026 09:30 — which means
    // the second cell was not read, not that both happen that morning.
    // Telling a student their resit is the same morning as the exam is worse
    // than telling them nothing.
    const r = yedionExamDates("1882-0301");
    expect(r.examDateA).not.toBeNull();
    expect(r.examDateB).toBeNull();
  });

  it("still returns both when they genuinely differ", () => {
    const r = yedionExamDates("0618-1012");
    expect(r.examDateA).not.toBeNull();
    expect(r.examDateB).not.toBeNull();
    expect(r.examDateA!.getTime()).not.toBe(r.examDateB!.getTime());
  });
});
