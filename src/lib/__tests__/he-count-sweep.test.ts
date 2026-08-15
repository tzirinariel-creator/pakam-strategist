// A guard, not a unit test: the "1 קורסים" family kept coming back because each
// fix was a one-off. This scans the student-facing source and fails if a bare
// `{expr} <plural-noun>` template reappears anywhere it has been cleaned.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
// Screens a student sees. src/components/admin/** is Ariel's own console and is
// deliberately out of scope — nobody is offended by "1 קורסים" in a sync log.
const SCOPE = ["components/exam-planner", "components/planner", "components/settings",
               "components/record", "components/onboarding", "components/dashboard"];
const PLURALS = ["קורסים", "ימים", "מבחנים", "שורות", "קבוצות", "סמסטרים", "מפגשים", "סטודנטים"];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(p);
    return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

describe("no bare {number} + plural-noun templates on student-facing screens", () => {
  it("every count goes through he-count.ts", () => {
    const offenders: string[] = [];
    const re = new RegExp(`\\{[^}]{1,40}\\}\\s+(${PLURALS.join("|")})\\b`, "g");
    for (const dir of SCOPE) {
      for (const file of walk(path.join(ROOT, dir))) {
        const src = fs.readFileSync(file, "utf-8");
        for (const m of src.matchAll(re)) {
          // A call into the helper is the fix, not a violation.
          if (/heNoun|heCount|heNounF/.test(m[0])) continue;
          offenders.push(`${path.relative(ROOT, file)}: ${m[0].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
