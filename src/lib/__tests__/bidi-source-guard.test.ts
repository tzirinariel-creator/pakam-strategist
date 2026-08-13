import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Source guard for the RTL ordinal bug (Ariel, 13.8).
 *
 * The onboarding step rail rendered ". 1 נקודת הפתיחה" instead of
 * "1. נקודת הפתיחה". Root cause: the period was written INSIDE the isolate —
 *
 *     <bdi dir="ltr">{i + 1}.</bdi> {label}      ← wrong
 *     <bdi dir="ltr">{i + 1}</bdi>. {label}      ← right
 *
 * With the period inside, "1." becomes a single LTR box placed at the start of
 * the RTL line, so the dot sits on the box's right edge — i.e. first in Hebrew
 * reading order. Verified by measuring per-character getBoundingClientRect in a
 * real RTL browser context.
 *
 * Why a source scan and not a render test: jsdom implements no bidi layout, so
 * `textContent` is identical for both spellings. A rendering test literally
 * cannot see this bug — which is exactly how the broken markup shipped with a
 * green suite. The DOM shape is the only thing assertable off-browser, so we
 * assert it across the whole tree instead of one component at a time.
 */

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (/\.tsx?$/.test(entry) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

// A <bdi>…</bdi> whose content ends in bidi-neutral punctuation. That trailing
// character belongs to the surrounding Hebrew sentence, not to the number, and
// must live outside the isolate.
const TRAILING_NEUTRAL = /<bdi\b[^>]*>(?:(?!<\/bdi>)[\s\S])*[.,:;!?]\s*<\/bdi>/g;

describe("bidi source guard — no sentence punctuation inside an isolate", () => {
  it("finds no <bdi> ending in a period/comma/colon anywhere in src/", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(TRAILING_NEUTRAL)) {
        // A decimal or dotted number ("3.5", "12.4.26") is legitimately whole —
        // the guard is only about punctuation that TERMINATES the isolate with
        // nothing after it, which is always sentence punctuation.
        const inner = m[0].replace(/^<bdi\b[^>]*>/, "").replace(/<\/bdi>$/, "");
        if (/\d[.,]\d/.test(inner) && !/[.,:;!?]\s*$/.test(inner)) continue;
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${file.replace(process.cwd() + "/", "")}:${line} → ${m[0]}`);
      }
    }

    expect(offenders, `Move the punctuation outside the <bdi>:\n${offenders.join("\n")}`).toEqual(
      []
    );
  });
});
