import { describe, it, expect } from "vitest";
import { parseSyllabus, syllabusDateToLocalNoon } from "@/lib/syllabus-scan";

describe("parseSyllabus", () => {
  it("parses a fenced payload with exams and assignments", () => {
    const out = parseSyllabus(`\`\`\`json
{"courseName":"מבוא למיקרו","items":[
  {"kind":"exam","title":"מועד א׳","date":"2026-07-15","moed":"A"},
  {"kind":"assignment","title":"הגשת תרגיל 3","date":"2026-05-20","moed":null}
]}
\`\`\``);
    expect(out?.courseName).toBe("מבוא למיקרו");
    expect(out?.items).toHaveLength(2);
    expect(out?.items[0]?.moed).toBe("A");
  });

  it("rejects garbage, bad dates and unknown kinds", () => {
    expect(parseSyllabus("cannot read")).toBeNull();
    expect(parseSyllabus('{"courseName":null,"items":[{"kind":"exam","title":"x","date":"15/07/2026","moed":null}]}')).toBeNull();
    expect(parseSyllabus('{"courseName":null,"items":[{"kind":"party","title":"x","date":"2026-07-15","moed":null}]}')).toBeNull();
  });

  it("rejects an impossible calendar date", () => {
    expect(parseSyllabus('{"courseName":null,"items":[{"kind":"exam","title":"x","date":"2026-13-45","moed":null}]}')).toBeNull();
  });

  // Audit HIGH #6: these pass the ISO regex and Date() rolls them over to a
  // real-but-different day (Feb 30 → Mar 2), so without a round-trip check the
  // task lands on a day the student never approved.
  it("rejects rollover dates that Date() would silently shift", () => {
    expect(parseSyllabus('{"courseName":null,"items":[{"kind":"exam","title":"x","date":"2026-02-30","moed":null}]}')).toBeNull();
    expect(parseSyllabus('{"courseName":null,"items":[{"kind":"assignment","title":"x","date":"2026-04-31","moed":null}]}')).toBeNull();
    // a real leap-year edge stays valid
    expect(parseSyllabus('{"courseName":null,"items":[{"kind":"exam","title":"x","date":"2028-02-29","moed":null}]}')?.items).toHaveLength(1);
  });
});

describe("syllabusDateToLocalNoon", () => {
  it("lands on local noon of the stated day (TZ-robust like the exam stamp)", () => {
    const d = syllabusDateToLocalNoon("2026-07-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(12);
  });
});
