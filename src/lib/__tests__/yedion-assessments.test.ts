// =========================================================================
// The ידיעון's exam/assignment board — and what it does NOT contain
// =========================================================================
// Ariel chased "the exam schedule" for three rounds. The first two files he
// sent were empty exports; the third is real. What it revealed is more useful
// than the file itself:
//
//   the ידיעון publishes exam SLOTS — day of week and time — and no dates.
//   Only the assignment/paper deadlines carry real dates.
//
// That is why no exam dates could be integrated: the source doesn't have that
// column yet for תשפ״ז. Verified against bid-it, which does print dates — for
// all four courses we could compare, the weekday of bid-it's date matches the
// ידיעון's day exactly (see the script header).
import { describe, it, expect } from "vitest";
import { parseAssessments, tokensFromDocumentXml } from "../../../scripts/parse-yedion-assessments";

/** A miniature of the real token stream, in the same shape Word produces. */
const EXAM_TOKENS = [
  "0618-1018", "לפילוסופיה", "של", "המוסר", "01", "סופית",
  "יום", "ה", "09:00", "יום", "ו", "09:00",
];
const PAPER_TOKENS = [
  "0651-1001", "מודרכת", "א", "'", "כל", "הקבוצות", "בית",
  "תאריך", "ושעת", "הגשת", "מטלה", "02/03/27", "יום", "ג",
];

describe("exam records — slots, never dates", () => {
  const [rec] = parseAssessments(EXAM_TOKENS);

  it("reads both sittings in order: מועד א׳ then מועד ב׳", () => {
    expect(rec!.kind).toBe("exam");
    expect(rec!.sittings).toEqual([
      { sitting: "A", dayOfWeek: "THURSDAY", time: "09:00" },
      { sitting: "B", dayOfWeek: "FRIDAY", time: "09:00" },
    ]);
  });

  it("carries NO date, because the ידיעון doesn't publish one", () => {
    expect(rec!.dueDate).toBeNull();
  });

  it("keeps the group", () => {
    expect(rec!.group).toBe("01");
  });

  it("never invents a third sitting from stray tokens", () => {
    const noisy = [...EXAM_TOKENS, "יום", "ב", "12:00"];
    expect(parseAssessments(noisy)[0]!.sittings).toHaveLength(2);
  });
});

describe("paper records — real deadlines", () => {
  const [rec] = parseAssessments(PAPER_TOKENS);

  it("reads the deadline as an ISO date", () => {
    expect(rec!.kind).toBe("paper");
    expect(rec!.dueDate).toBe("2027-03-02");
  });

  it("reads 'כל הקבוצות' as the group", () => {
    expect(rec!.group).toBe("כל הקבוצות");
  });

  it("has no sittings — a paper has no מועד א׳/ב׳", () => {
    expect(rec!.sittings).toEqual([]);
  });
});

describe("robustness", () => {
  it("splits a stream into one record per course code", () => {
    const recs = parseAssessments([...EXAM_TOKENS, ...PAPER_TOKENS]);
    expect(recs.map((r) => r.courseCode)).toEqual(["0618-1018", "0651-1001"]);
  });

  it("drops table-header artefacts that carry nothing usable", () => {
    const headers = ["1234-5678", "מספר", "קורס", "סמסטר", "קבוצה"];
    expect(parseAssessments(headers)).toEqual([]);
  });

  it("ignores a malformed day/time pair rather than guessing", () => {
    const bad = ["0618-1018", "סופית", "יום", "ז", "09:00", "יום", "ה", "0900"];
    expect(parseAssessments(bad)[0]?.sittings ?? []).toEqual([]);
  });

  it("expands the two-digit year to 2027, not 1927", () => {
    expect(parseAssessments(PAPER_TOKENS)[0]!.dueDate!.startsWith("2027")).toBe(true);
  });
});

describe("tokensFromDocumentXml", () => {
  it("extracts run text in document order and unescapes entities", () => {
    const xml = `<w:body><w:p><w:r><w:t>0618-1018</w:t></w:r><w:r><w:t xml:space="preserve">לפכ&quot;מ</w:t></w:r></w:p></w:body>`;
    expect(tokensFromDocumentXml(xml)).toEqual(["0618-1018", 'לפכ"מ']);
  });

  it("drops runs whose content is leaked XML rather than text", () => {
    const xml = `<w:body><w:t>ok</w:t><w:t>&lt;w:left w:color="auto"/&gt;</w:t></w:body>`;
    expect(tokensFromDocumentXml(xml)).toEqual(["ok"]);
  });
});
