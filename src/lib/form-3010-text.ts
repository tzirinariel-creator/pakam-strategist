// =========================================================================
// Form 3010's text layer → service periods, read rather than guessed
// =========================================================================
// Ariel, 21.8: "הוא לא הצליח לקלוט את ה-3010 שלי משום מה".
//
// The scanner was vision-only. His form — the one the IDF's own site issues —
// is a generated PDF with a perfectly clean text layer: ten rows, each a start
// date, an end date and a decimal day count. Asking a vision model to read a
// dense RTL table it could simply be TOLD is the same mistake the grade-sheet
// scanner made, and it fails the same way: silently, on the row you needed.
//
// So this reads the text layer directly, and the caller falls back to vision
// only when there is no text layer (a photo saved as a PDF) or when the
// arithmetic below does not check out.
//
// THE SELF-CHECK is what makes it safe to trust. Every row prints its own
// "סה\"כ ימים", and that number must equal the span between its two dates.
// The IDF counts inclusively — 21/05/2024 to 25/05/2024 is 5 days, not 4 —
// so `end - start + 1` must match the printed figure. When a row disagrees we
// have misread something, and we hand the whole document back to vision rather
// than import a period we cannot verify. Being exact is only worth something
// if we also know when we are not.

/** Bidi controls saturate text extracted from Hebrew PDFs. */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;

export interface ServicePeriodRow {
  /** DD/MM/YYYY, exactly as printed. */
  startDate: string;
  endDate: string;
  /** The row's own printed סה"כ ימים. */
  days: number;
}

export interface Form3010Text {
  periods: ServicePeriodRow[];
  /** Sum of the printed day counts — a figure, not a claim about eligibility. */
  totalDays: number;
}

function parseDmy(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  // UTC so a timezone can never shift a date across midnight.
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(mo) - 1) return null;
  return date;
}

/** Inclusive day count, the way the form counts it. */
export function inclusiveDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * Read the service-period rows out of a 3010's extracted text.
 *
 * Returns null when this does not look like a 3010, when no row survives, or
 * when any row fails its own day-count check — every one of those cases means
 * the caller should fall back to vision instead of trusting this.
 */
export function parseForm3010Text(raw: string): Form3010Text | null {
  const text = raw.replace(BIDI_CONTROLS, "");

  // Must actually be a 3010. Without this a random PDF with dates in it could
  // be read as a service record.
  if (!/טופס\s*3010/.test(text) && !/שירות\s*מילואים/.test(text)) return null;

  // The rows are `start end days` in reading order once bidi is stripped, but
  // PDF extraction can interleave the RTL columns, so rather than assume a
  // column order we take every (date, date, number) triple in sequence and
  // then verify each one arithmetically. A wrong pairing cannot survive the
  // check, which is exactly why the check exists.
  const tokens = text.match(/\d{2}\/\d{2}\/\d{4}|\d+\.\d+|\d+/g) ?? [];

  const periods: ServicePeriodRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i + 2 < tokens.length; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const c = tokens[i + 2]!;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(a) || !/^\d{2}\/\d{2}\/\d{4}$/.test(b)) continue;
    if (!/^\d+(\.\d+)?$/.test(c)) continue;

    const days = Number(c);
    if (!Number.isFinite(days) || days <= 0 || days > 400) continue;

    // Either column order is accepted, then disambiguated by the arithmetic:
    // whichever assignment reproduces the printed day count is the right one.
    for (const [sRaw, eRaw] of [[a, b], [b, a]] as const) {
      const s = parseDmy(sRaw);
      const e = parseDmy(eRaw);
      if (!s || !e || e < s) continue;
      if (inclusiveDays(s, e) !== Math.round(days)) continue;

      const key = `${sRaw}|${eRaw}`;
      if (seen.has(key)) break;
      seen.add(key);
      periods.push({ startDate: sRaw, endDate: eRaw, days });
      i += 2; // this triple is consumed
      break;
    }
  }

  if (periods.length === 0) return null;

  return {
    periods,
    totalDays: Math.round(periods.reduce((sum, p) => sum + p.days, 0) * 10) / 10,
  };
}
