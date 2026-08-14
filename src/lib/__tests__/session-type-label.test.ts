// =========================================================================
// One word for `tutorial`, everywhere — and a guard that keeps it that way
// =========================================================================
// `tutorial` used to render as "תרגול" on every screen but as "תרגיל" in the
// .ics download and on the bidding worksheet: the calendar the student
// EXPORTED disagreed with the calendar they were looking at, for the same
// meeting (audit deferred-3). "תרגול" is the ידיעון's own word for the session
// type and was already the overwhelming majority, so that is the one word.
//
// Two legitimate uses of "תרגיל" survive and must NOT be swept up:
//   • scraper/parser.ts and xlsx-export.ts READ the ידיעון, which prints both
//     spellings (and TAU course NAMES contain "תרגיל צמוד ל…").
//   • the `PRACTICE` courseType — a degree-requirement bucket capped at 8 ש״ס,
//     not a weekly session.
// The scan at the bottom encodes exactly that line: parse both, print one.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sessionTypeNameFor } from "@/lib/group-options";
import { generateICSFromSessions } from "@/lib/ics-export";
import { buildWeekShareText } from "@/lib/week-share";

describe("sessionTypeNameFor — the single label source", () => {
  it("names tutorial תרגול / Tutorial", () => {
    expect(sessionTypeNameFor("tutorial", true)).toBe("תרגול");
    expect(sessionTypeNameFor("tutorial", false)).toBe("Tutorial");
  });

  it("is case-insensitive — a student-created course stores TUTORIAL/LECTURE", () => {
    // custom-course-modal writes uppercase; only some of the old copies handled
    // it, so the rest printed the raw enum inside a Hebrew screen.
    expect(sessionTypeNameFor("TUTORIAL", true)).toBe("תרגול");
    expect(sessionTypeNameFor("LECTURE", true)).toBe("הרצאה");
    expect(sessionTypeNameFor("Lab", false)).toBe("Lab");
  });

  it("still falls back to the raw value for a genuinely unknown type", () => {
    expect(sessionTypeNameFor("colloquium", true)).toBe("colloquium");
  });
});

describe("the exported surfaces agree with the screens", () => {
  const session = (sessionType: string) => ({
    id: `s-${sessionType}`,
    dayOfWeek: "MONDAY",
    startTime: "10:00",
    endTime: "12:00",
    sessionType,
    room: null,
    building: null,
    course: { nameHe: "מבוא ללוגיקה", nameEn: "Intro to Logic" },
  });

  it(".ics download says תרגול, not תרגיל", () => {
    const ics = generateICSFromSessions(
      [session("tutorial"), session("lecture"), session("lab")] as never,
      "FALL",
    );
    expect(ics).toContain("תרגול");
    expect(ics).not.toContain("תרגיל");
    expect(ics).toContain("הרצאה");
    expect(ics).toContain("מעבדה");
  });

  it("an unknown/blank session type still falls back to הרצאה in the .ics", () => {
    // Historical default of both emitters — preserved by the `|| \"lecture\"`.
    const ics = generateICSFromSessions([session("")] as never, "FALL");
    expect(ics).toContain("הרצאה");
  });

  it("the WhatsApp week share uses the same words in both languages", () => {
    const rows = [
      {
        ...session("tutorial"),
        course: { nameHe: "מבוא ללוגיקה", nameEn: "Intro to Logic" },
      },
    ] as never;
    const he = buildWeekShareText(rows, {
      semesterLabel: "סמסטר א׳",
      appUrl: "https://x",
      isHe: true,
    });
    expect(he).toContain("(תרגול)");
    const en = buildWeekShareText(rows, {
      semesterLabel: "Fall",
      appUrl: "https://x",
      isHe: false,
    });
    // Used to leak the raw code ("tutorial") into the English share text.
    expect(en).toContain("(Tutorial)");
  });
});

// -------------------------------------------------------------------
// Drift guard: the word may be PARSED anywhere, PRINTED in one place.
// -------------------------------------------------------------------
const SRC = path.resolve(__dirname, "../..");

/** Files allowed to contain "תרגיל" — all of them READ it, none PRINT it. */
const READS_TUTORIAL_SPELLINGS = new Set(
  [
    // Hebrew → code, off the ידיעון, which prints both spellings.
    "lib/scraper/parser.ts",
    // Strips a trailing "+ תרגיל"/"- תרגול" off a course NAME for the sheet.
    "lib/xlsx-export.ts",
    // The scanner prompt describes real TAU transcript rows ("תרגיל צמוד ל…").
    "lib/grade-sheet.ts",
  ].map((p) => path.join(SRC, p)),
);

// Owner-written PROSE that names the session type inside a sentence
// ("זכרתי: הרצאה + תרגיל = יחידה אחת" in bidding-explainer.tsx, and the same
// phrase in ai/mentor-prompt.ts and degree-qa.ts; anchored-tour.tsx's
// "לכל הרצאה או תרגיל…") is deliberately NOT rewritten here — changing product
// copy is the owner's call, not a refactor's. The guard below only looks at
// BARE label literals, which is what a mapping table is, so prose passes it
// without needing an allowlist entry.

/** Strip comments so a sentence ABOUT the bug can't trip the guard. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** A label map is a literal whose ENTIRE content is the word: "תרגול". */
const BARE_LABEL = /(["'`])\s*(תרגול|תרגיל)\s*\1/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("no second session-type label map can appear", () => {
  it("only lib/group-options.ts prints a session-type label", () => {
    const canonical = path.join(SRC, "lib/group-options.ts");
    const offenders = sourceFiles(SRC).filter((f) => {
      if (f === canonical || READS_TUTORIAL_SPELLINGS.has(f)) return false;
      return BARE_LABEL.test(stripComments(readFileSync(f, "utf8")));
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("the canonical map is the one that says תרגול", () => {
    const src = stripComments(readFileSync(path.join(SRC, "lib/group-options.ts"), "utf8"));
    expect(src).toMatch(/tutorial:\s*\{\s*he:\s*"תרגול"/);
    expect(BARE_LABEL.test(src.replace(/"תרגול"/g, ""))).toBe(false);
  });

  it("the guard would actually catch a re-introduced תרגיל label", () => {
    // Self-check: the regex is the load-bearing part of the guard above.
    expect(BARE_LABEL.test('const M = { tutorial: "תרגיל" };')).toBe(true);
    expect(BARE_LABEL.test("const M = { tutorial: 'תרגול' };")).toBe(true);
    // …and that it does NOT fire on prose that merely contains the word.
    expect(BARE_LABEL.test('"זכרתי: הרצאה + תרגיל = יחידה אחת"')).toBe(false);
  });
});
