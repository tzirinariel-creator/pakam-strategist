import React from "react";

// =========================================
// Bidi — isolate LTR runs inside Hebrew (RTL) text
// =========================================
// In an RTL paragraph, Latin/number/symbol runs ("35+", "21-34", "+10%",
// "0651-1007", "7.10.23", "2/5") are rendered in the WRONG order by the Unicode
// Bidi algorithm (e.g. "35+" shows as "+35", "21-34" as "34-21"). Wrapping each
// such run in an isolated, force-LTR <bdi> fixes it without touching the source
// strings. Pure Hebrew text and standalone words are left untouched.

// A run = optional leading sign, then alphanumerics, with internal . , : / - – + %
// connectors, and an optional trailing % or +. Matches "35+", "21-34", "+10%",
// "0651-1007", "7.10.23", "2/5", "C", "MA".
const LTR_RUN = /[+\-]?[A-Za-z0-9]+(?:[.,:/+\-–][A-Za-z0-9]+)*[%+]?/g;

/**
 * Render `text` with every LTR/numeric run wrapped in an isolated, force-LTR
 * <bdi> so it reads correctly inside RTL Hebrew. Safe for English text too
 * (the whole string is one run → one bdi, no visual change).
 */
export function Bidi({ text }: { text: string | number | null | undefined }) {
  if (text === null || text === undefined) return null;
  const str = String(text);
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Fresh regex per call — global regexes are stateful.
  const re = new RegExp(LTR_RUN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(str.slice(last, m.index));
    parts.push(
      <bdi key={key++} dir="ltr">
        {m[0]}
      </bdi>
    );
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
  }
  if (last < str.length) parts.push(str.slice(last));
  return <>{parts}</>;
}
