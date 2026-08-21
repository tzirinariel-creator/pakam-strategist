// =========================================================================
// A tRPC hook below an early return — the crash lint cannot see
// =========================================================================
// The planner went to a blank error screen in production: React #310,
// "rendered more hooks than during the previous render". The cause was two
// lines I had added to planner-content.tsx:
//
//   if (isLoading) return <Skeleton />;          ← render 1 stops here
//   …
//   const utils = api.useUtils();                ← render 2 runs these
//   const move  = api.plan.updateCourse.useMutation({ … });
//
// The first render skipped them, the render after the data arrived ran them,
// and React counts hooks per render. tsc, lint and 1,919 unit tests were all
// green; only opening the page as a user found it.
//
// WHY LINT MISSED IT — this is the part worth keeping. `rules-of-hooks` is on
// at error level here, and it DOES catch the same mistake written as a bare
// `useState`. It does not resolve deep member expressions, so
// `api.plan.updateCourse.useMutation()` is not recognised as a hook at all.
// Verified both ways against this very config: the bare-hook probe errors, the
// tRPC-shaped probe is silent. Since every data hook in this codebase is
// `api.<router>.<proc>.use*()`, the single most valuable React rule was
// effectively switched off across the whole app.
//
// So the check has to exist here. It is intentionally a text scan and not an
// AST pass: it keys on this repo's uniform 2-space formatting, where "top
// level of a component" is exactly "starts with two spaces".

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Both patterns anchor on EXACTLY two leading spaces — `^ {2}(?! )`. The first
// version used `^ {2}…\s*`, and that trailing `\s*` happily ate the deeper
// indentation, so a `return` inside a `useMemo(() => { … })` counted as a
// top-level early exit and the check reported 19 files that were all fine. A
// guard with false positives is worse than none: it gets skimmed, then muted.

/** `const x = api.a.b.useQuery(…)` and friends, at a component's top level. */
const HOOK_CALL = /^ {2}(?! )(?:const|let|var)?\s*.*?\b[\w.]+\.use[A-Z]\w*\s*\(/;
/** A top-level early exit: `if (…) return …` or a bare `return` at depth 1. */
const EARLY_RETURN = /^ {2}(?! )(?:if \(.*\)\s*)?return[\s;({]/;
/** The line that opens a component's body. */
const COMPONENT = /^export (?:default )?function [A-Z]\w*/;

function violations(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!e.name.endsWith(".tsx")) continue;
      const rel = path.relative(process.cwd(), full);
      const lines = fs.readFileSync(full, "utf-8").split("\n");

      let inComponent = false;
      let sawReturn = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (COMPONENT.test(line)) {
          inComponent = true;
          sawReturn = false;
          continue;
        }
        // Column 0 `}` closes the component body.
        if (inComponent && /^}/.test(line)) {
          inComponent = false;
          continue;
        }
        if (!inComponent) continue;
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        if (EARLY_RETURN.test(line)) sawReturn = true;
        if (sawReturn && HOOK_CALL.test(line)) {
          out.push(`${rel}:${i + 1} — ${line.trim()}`);
        }
      }
    }
  };
  walk(path.join(process.cwd(), "src"));
  return out;
}

describe("no React hook below an early return", () => {
  it("finds no hook that renders only on some renders", () => {
    // Every entry here is a blank error screen waiting for the render where
    // the data finally arrives.
    expect(violations()).toEqual([]);
  });
});
