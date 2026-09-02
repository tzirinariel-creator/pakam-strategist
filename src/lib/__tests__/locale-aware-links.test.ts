// =========================================================================
// #2 — "זה קפץ לאנשהו, חזרתי ופתאום בום"
// =========================================================================
// Ariel came to the planner from the bidding screen, ended up somewhere else,
// came back, and found himself planning year 1 semester A with his whole
// board reset.
//
// The link was <Link href="/planner/semester"> using the RAW next/link. It
// emits the href verbatim, so the locale prefix is missing, so the next-intl
// middleware answers with a redirect to /he/planner/semester — and a redirect
// is a FULL page load. The client router unmounts, every component remounts
// from scratch, and the planner opens on its defaults instead of on the year
// the student was actually looking at.
//
// It was ONE link out of the whole app. That is exactly why it needs a test
// and not just a fix: nothing about the wrong version looks wrong, it type-
// checks, it lints, and it navigates — it just navigates the expensive way and
// takes the student's place in the app with it.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("internal links carry the locale", () => {
  it("no component under [locale] links with the raw next/link", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      if (!/from "next\/link"/.test(src)) continue;
      src.split("\n").forEach((line, i) => {
        const m = /href="(\/[^"]*)"/.exec(line);
        if (!m) return;
        const href = m[1]!;
        // Already-prefixed hrefs and API routes are fine. So is the root "/",
        // which only appears on not-found.tsx — that page lives OUTSIDE the
        // [locale] segment, so there is no locale for it to carry.
        if (/^\/(he|en)\//.test(href) || href.startsWith("/api/") || href === "/") return;
        offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}  ${href}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the bidding screen's planner link is the locale-aware one", () => {
    // The specific link Ariel followed. Pinned by name so a future refactor
    // that swaps the import back is caught here rather than by a student.
    const src = readFileSync(
      join(process.cwd(), "src/app/[locale]/(protected)/bidding/bidding-content.tsx"),
      "utf8",
    );
    expect(src).toContain('import { Link } from "@/i18n/navigation"');
    expect(src).not.toContain('import Link from "next/link"');
  });
});
