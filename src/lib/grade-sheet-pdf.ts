// =========================================================================
// PDF text layer → the same payload the vision path returns
// =========================================================================
// Adapter between `parseSheetText` (pure, tested against three real sheets)
// and the shape `/api/ai/scan-grades` already returns, so every screen
// downstream — the onboarding review, /record, the gap banner — keeps working
// unchanged and simply receives better data.
//
// The self-check is the point: we recompute the averages TAU printed and only
// take this path when they MATCH. If they don't, something about this document
// isn't what we think it is, and we hand it back to the vision path rather than
// trusting a parse we can't verify. Being exact is only worth anything if we
// also know when we're not.
import { parseSheetText, semesterAverageOf, weightedAverageOf } from "@/lib/grade-sheet-text";
import { mapEnglishLevelLabel } from "@/lib/grade-sheet";
import type { ScanDiagnostics } from "@/lib/grade-sheet";

/** Tolerance for the printed-vs-recomputed check. TAU rounds to 2 decimals. */
const AVG_EPSILON = 0.02;

export interface ExactScanResult {
  rows: {
    courseCode: string;
    courseName: string;
    grade: number | null;
    credits: number | null;
    passText: string | null;
    semester: string | null;
    inProgress: boolean;
    gradeOutOfRange?: boolean;
    /** The sheet's own "doesn't count toward the average" marker. */
    excludedFromAverage?: boolean;
  }[];
  englishLevel: string | null;
  averageMismatch: { computed: number; printed: number } | null;
  diagnostics: ScanDiagnostics;
  /** Tells the UI it may state the result as read, not as interpreted. */
  source: "pdf-text";
}

/**
 * Try to read a TAU grade sheet exactly. Returns null when this is not such a
 * sheet, when it has no text layer (a photo saved as PDF), or when the parse
 * fails its own arithmetic self-check — in every one of those cases the caller
 * falls back to vision.
 */
export async function extractSheetFromPdf(base64: string): Promise<ExactScanResult | null> {
  // Imported lazily so the vision path never pays for the PDF runtime.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });

  const parsed = parseSheetText(text);
  if (!parsed || parsed.rows.length === 0) return null;

  // ── Self-check: our arithmetic must equal what the sheet prints ──────────
  for (const [sem, printed] of Object.entries(parsed.semesterAverages)) {
    const ours = semesterAverageOf(parsed.rows, sem);
    if (ours == null || Math.abs(ours - printed) > AVG_EPSILON) return null;
  }
  if (parsed.programAverage != null) {
    const ours = weightedAverageOf(parsed.rows);
    if (ours == null || Math.abs(ours - parsed.programAverage) > AVG_EPSILON) return null;
  }

  const rows = parsed.rows.map((r) => ({
    courseCode: r.courseCode,
    courseName: r.courseName,
    grade: r.grade,
    // Downstream counts ש״ס from `credits`. A blank משקל means the sheet does
    // not weigh this course — carry the printed hours so the course is visible,
    // and flag it so nothing counts it into an average.
    credits: r.credits ?? r.hours,
    passText: r.passText,
    semester: r.semester,
    inProgress: r.inProgress,
    ...(r.gradeOutOfRange ? { gradeOutOfRange: true } : {}),
    ...(r.credits == null ? { excludedFromAverage: true } : {}),
  }));

  const withGrade = rows.filter((r) => r.grade != null).length;
  const diagnostics: ScanDiagnostics = {
    semesters: Array.from(new Set(rows.map((r) => r.semester).filter((x): x is string => !!x))).sort(),
    firstReadRows: rows.length,
    // There is no second read: an exact parse has nothing to disagree with.
    verifyReadRows: rows.length,
    verifyFailed: false,
    withGrade,
    withoutGrade: rows.length - withGrade,
    disputed: 0,
    rejectedRows: 0,
    censusFailed: false,
    missingRows: [],
    missingGrades: [],
  };

  return {
    rows,
    englishLevel: mapEnglishLevelLabel(parsed.englishLabel),
    // The printed average IS our average here — that is the precondition for
    // taking this path at all, so there is never a mismatch to report.
    averageMismatch: null,
    diagnostics,
    source: "pdf-text",
  };
}
