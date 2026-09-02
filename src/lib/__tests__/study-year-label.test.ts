// =========================================================================
// #8 — "ולמה כתוב שנה 2 ולא שנה ב׳?"
// =========================================================================
// He pointed at one line on the bidding screen. The digit was in eight places,
// because there was no helper — every screen had reinvented the lookup, and the
// ones that forgot printed the number. This pins the helper AND sweeps the
// source for the pattern coming back.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { studyYearLabel, studyYearLetter, studyYearList } from "@/lib/study-year-label";

describe("a study year is spoken as a letter", () => {
  it("names all three years", () => {
    expect(studyYearLabel(1, true)).toBe("שנה א׳");
    expect(studyYearLabel(2, true)).toBe("שנה ב׳");
    expect(studyYearLabel(3, true)).toBe("שנה ג׳");
  });

  it("uses gershayim, not an apostrophe", () => {
    // ׳ (U+05F3) is the Hebrew geresh. A plain ' is the wrong character and
    // looks wrong beside the rest of the product's typography.
    for (const y of [1, 2, 3]) {
      expect(studyYearLabel(y, true)).toContain("׳");
      expect(studyYearLabel(y, true)).not.toContain("'");
    }
  });

  it("speaks English on the English side", () => {
    expect(studyYearLabel(2, false)).toBe("Year B");
  });

  it("gives just the letter when the sentence already says שנה", () => {
    expect(studyYearLetter(2, true)).toBe("ב׳");
    expect(studyYearList([1, 2], true)).toBe("א׳/ב׳");
  });

  it("says nothing for a missing year rather than 'שנה null'", () => {
    expect(studyYearLabel(null, true)).toBe("");
    expect(studyYearLabel(undefined, true)).toBe("");
  });

  it("falls back to the digit for a year we have no name for", () => {
    // Better than printing nothing if a 4th year is ever added upstream.
    expect(studyYearLabel(4, true)).toBe("שנה 4");
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      walk(p, out);
    } else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("no screen prints the year as a digit", () => {
  it("has no `שנה ${...}` template left in a component", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src/components"))) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // The helper itself and YEAR_CONFIG fallbacks are the sanctioned way.
        if (/study-year-label|YEAR_CONFIG/.test(line)) return;
        if (/שנה \$\{|בשנה \$\{|לשנה \$\{|שנה <Bidi|בשנה <Bidi/.test(line)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}`);
        }
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
