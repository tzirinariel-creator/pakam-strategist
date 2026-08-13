// =========================================
// Grade-sheet scanner — pure parsing + matching
// =========================================
// The vision model returns rows it READ off the student's grade sheet; this
// module validates them strictly and matches them to the user's own courses.
// Nothing here writes — applying is the student's explicit per-row choice,
// through the existing plan.updateCourse mutation (ownership + demo guards).

import { z } from "zod/v4";

/** One row as extracted by the model from the sheet image. */
export const extractedRowSchema = z.object({
  courseCode: z.string().max(30).nullable(),
  courseName: z.string().min(1).max(120),
  grade: z.number().min(0).max(100).nullable(),
  credits: z.number().min(0).max(20).nullable(),
  /** Binary pass marks like "עובר"/"פטור" come back as passText, not a grade. */
  passText: z.string().max(30).nullable(),
  /** "2025/1" — from the semester header line above the row's block. */
  semester: z.string().max(12).nullish(),
  /** The sheet prints *** in the grade column for enrolled-not-yet-graded. */
  inProgress: z.boolean().nullish(),
});

export const extractionSchema = z.object({
  rows: z.array(extractedRowSchema).max(80),
  /**
   * #23 — the English LEVEL as printed on the "דרישות כלל אוניברסיטאיות" line
   * (e.g. "מתקדמים ב'"), with no number. Optional; absent on sheets that don't
   * print it. Kept as raw text here and mapped to an enum by mapEnglishLevelLabel.
   */
  englishLevelLabel: z.string().max(60).nullish(),
  /** #5 — the weighted average PRINTED on the sheet ("ממוצע משוקלל"), used to
   *  cross-check the extracted grades. null when the sheet doesn't print one. */
  printedAverage: z.number().min(0).max(100).nullish(),
});

export type ExtractedRow = z.infer<typeof extractedRowSchema>;

// Bidi control characters (LRM/RLM, embeddings, isolates, ALM) saturate text
// extracted from the real TAU PDF (verified on an actual transcript, 7.2026):
// they are invisible, split words into fragments like "ש'", and break both
// name matching and code matching. Never meaningful data — strip everywhere.
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// The teaching-mode column (ש' / ת' / ש'+ת' / שו"ת) sits right next to the
// course-name column on the sheet; when the model glues it onto the name we
// strip it — it is metadata, not part of any real course name. Quote marks
// vary by OCR (' ׳ ’ " ״), so match all of them. Bidi reversal in PDF text
// extraction can also mirror the token (ש' → 'ש, שו"ת → ת"וש) — match those too.
const MODE_TOKEN = `(?:ש[׳'’]?\\+ת[׳'’]?|[׳'’]?ת\\+[׳'’]?ש|שו["״]ת|ת["״]וש|ש[׳'’]|ת[׳'’]|[׳'’]ש|[׳'’]ת)`;
const MODE_AT_EDGES = new RegExp(`^${MODE_TOKEN}\\s+|\\s+${MODE_TOKEN}$`, "g");

// The "הערות" column sits at the far edge of the same row and carries free
// text — in practice always "לא לשקלול" (an English course that doesn't count
// toward the average). When the model glues it onto the name, the review list
// showed a row literally reading "לא לשקלול" instead of a course (#29). It is
// an annotation, never part of a course name — strip it at both edges.
const NOTE_TOKEN = `(?:לא\\s+לשקלול|לשקלול\\s+לא)`;
const NOTE_AT_EDGES = new RegExp(`^${NOTE_TOKEN}\\s*|\\s*${NOTE_TOKEN}$`, "g");

/**
 * Strip the sheet's neighbouring COLUMNS (teaching mode, "הערות") off a course
 * name the model returned. Exported so the behaviour is locked by tests: a
 * name that is ONLY an annotation must come back unchanged rather than empty,
 * so the row is still shown and matched (and simply won't match a course).
 */
export function cleanCourseName(raw: string): string {
  const cleaned = raw
    .replace(NOTE_AT_EDGES, "")
    .replace(MODE_AT_EDGES, "")
    .replace(MODE_AT_EDGES, "")
    .replace(NOTE_AT_EDGES, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

/** Validate the model's raw text into the full extraction (rows + English
 *  level), or null. Shared by parseExtraction and parseEnglishLevelLabel so a
 *  single scan is parsed once, consistently. */
function extractValidated(text: string): z.infer<typeof extractionSchema> | null {
  // Bidi controls first — they ride along when the model echoes PDF-extracted
  // text, and would poison every string field (names, codes, semester tags).
  const stripped = text.replace(BIDI_CONTROLS, "").replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  // TAU zero-pads grades to three digits (089 = 89). If the model echoes the
  // padding, `"grade":089` is invalid JSON and would kill the WHOLE scan —
  // strip leading zeros on the grade field only (course codes are quoted).
  const jsonText = stripped
    .slice(start, end + 1)
    .replace(/("grade"\s*:\s*)0+(\d)/g, "$1$2");
  try {
    const parsed = extractionSchema.safeParse(JSON.parse(jsonText));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Parse the model's text output (may be wrapped in ```json fences). */
export function parseExtraction(text: string): ExtractedRow[] | null {
  const data = extractValidated(text);
  if (!data) return null;
  return data.rows.map((r) => ({
    ...r,
    courseName: cleanCourseName(r.courseName),
  }));
}

/** The raw English-level label the model read off the sheet (#23), or null. */
export function parseEnglishLevelLabel(text: string): string | null {
  return extractValidated(text)?.englishLevelLabel ?? null;
}

/** The weighted average printed on the sheet (#5 cross-check), or null. */
export function parsePrintedAverage(text: string): number | null {
  return extractValidated(text)?.printedAverage ?? null;
}

// =========================================================================
// #5 — double-read verification. The sheet is read TWICE by the vision model
// (extract, then verify). These pure helpers merge the two reads and flag
// every disagreement, so a swapped digit can never land silently.
// =========================================================================

export interface VerifiedRow extends ExtractedRow {
  /** True when the two reads disagreed on this row's grade/passText, or the
   *  row appeared in only one read. The UI must visibly ask the student to
   *  double-check flagged rows against the sheet. */
  uncertain?: boolean;
  /** The other read's grade when the reads disagreed (for the UI hint). */
  otherGrade?: number | null;
}

const rowKey = (r: ExtractedRow): string =>
  (r.courseCode?.replace(/\D/g, "") || "") + "|" + normalizeName(r.courseName);

/**
 * Reconcile the two reads of ONE row.
 *
 * The asymmetry that matters (Ariel, 13.8 — "לא הצליח לקלוט שעשיתי לוגיקה"):
 * a grade that is printed on the sheet is POSITIVE evidence, while a read that
 * came back empty is only an absence of evidence. The old rule ("the verify
 * pass always wins") let the empty read overwrite the number — so one flaky
 * second read turned a course the student passed into "בלימוד", dropped its
 * ש״ס, and printed "מופיע בגיליון בלי ציון" as if the document said so.
 *
 * When the two reads disagree about whether the row has a grade AT ALL we now
 * decide nothing: no invented number (the iron rule), and no invented "still
 * studying" either. The row comes back with no grade, NOT flagged in-progress,
 * carrying the number one read did see in `otherGrade` — so the review screen
 * can show both readings and let the student settle it in one tap.
 */
function reconcileReads(f: ExtractedRow, v: ExtractedRow): VerifiedRow {
  const fg = f.grade ?? null;
  const vg = v.grade ?? null;
  const gradeAgrees = fg === vg;
  const passAgrees = (f.passText ?? null) === (v.passText ?? null);
  if (gradeAgrees && passAgrees) return { ...f };

  if ((fg == null) !== (vg == null)) {
    // Exactly one read saw a number. Keep the read that saw none as the base
    // (so we never assert a grade), but drop its *** flag — the other witness
    // says that cell was not empty, so "עדיין בלימוד" is not a fact either.
    const base = fg == null ? f : v;
    return { ...base, grade: null, inProgress: false, uncertain: true, otherGrade: fg ?? vg };
  }

  // Both reads saw a number (a different one) or the pass-text differs: the
  // verify pass looked at the image a second time, specifically checking, so
  // its value wins — flagged, with the other read carried for display.
  return { ...v, uncertain: true, otherGrade: fg };
}

/**
 * Merge two independent reads of the same sheet. Rules:
 * - Row in both, same grade+passText → confident.
 * - Row in both, disagreeing → reconcileReads above.
 * - Row in exactly one read → keep it, flagged uncertain (a dropped row is
 *   exactly the קריאה-מודרכת-א׳ failure mode).
 *
 * Rows are paired by key IN ORDER, as a queue. A sheet legitimately carries the
 * same course twice — a retake, or the same course under two semester headers —
 * and the old key→row Map kept only the LAST of them, so both first-read rows
 * were reconciled against that one row: the graded sitting was overwritten by
 * the ungraded one, and a passed course came back with no grade at all.
 */
export function mergeDoubleRead(first: ExtractedRow[], verify: ExtractedRow[]): VerifiedRow[] {
  const verifyQueue = new Map<string, number[]>();
  verify.forEach((v, i) => {
    const key = rowKey(v);
    const queue = verifyQueue.get(key);
    if (queue) queue.push(i);
    else verifyQueue.set(key, [i]);
  });

  const consumed = new Set<number>();
  const out: VerifiedRow[] = [];

  for (const f of first) {
    const queue = verifyQueue.get(rowKey(f));
    const index = queue && queue.length > 0 ? queue.shift()! : null;
    if (index == null) {
      out.push({ ...f, uncertain: true });
      continue;
    }
    consumed.add(index);
    out.push(reconcileReads(f, verify[index]!));
  }
  // Rows the verify pass found that the first read dropped entirely — in the
  // verify pass's own order, so the sheet's order survives.
  for (let i = 0; i < verify.length; i++) {
    if (!consumed.has(i)) out.push({ ...verify[i]!, uncertain: true });
  }
  return out;
}

/**
 * Cross-check the extracted grades against the average PRINTED on the sheet.
 * Simple credit-weighted mean over graded rows; a drift beyond the tolerance
 * means at least one grade/credit was misread → the UI shows a banner. The
 * sheet's own average may use slightly different inclusion rules, so the
 * tolerance is generous (1.5) — this catches swaps, not rounding.
 */
export function printedAverageMismatch(
  rows: ExtractedRow[],
  printedAverage: number | null | undefined,
): { computed: number; printed: number } | null {
  if (printedAverage == null) return null;
  // TAU's printed weighted average EXCLUDES English (iron rule: אנגלית לא בממוצע).
  // A graded English course would otherwise drag `computed` past the tolerance and
  // false-fire the "a grade was misread" banner on a correctly-scanned sheet
  // (launch audit 24.7). Detect English by name — the extracted row has no
  // courseType yet. ("לא לשקלול" rows are already stripped upstream.)
  const isEnglishName = (name: string) => /אנגלית|english/i.test(name);
  const graded = rows.filter(
    (r) => r.grade != null && !r.inProgress && !isEnglishName(r.courseName ?? ""),
  );
  if (graded.length < 3) return null; // too little signal to judge
  let credits = 0;
  let sum = 0;
  for (const r of graded) {
    const c = r.credits ?? 1;
    credits += c;
    sum += (r.grade as number) * c;
  }
  if (credits === 0) return null;
  const computed = sum / credits;
  return Math.abs(computed - printedAverage) > 1.5
    ? { computed: Math.round(computed * 10) / 10, printed: printedAverage }
    : null;
}

/** Loose Hebrew-aware normalization for name matching. Exported so the
 *  onboarding catalog-matcher shares the exact same normalization. */
export function normalizeName(s: string): string {
  return s
    .replace(BIDI_CONTROLS, "")
    .replace(/["'׳״־׳״-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface UserCourseLite {
  userCourseId: string;
  courseCode: string;
  nameHe: string;
  currentGrade: number | null;
  status: string;
  /** COURSE type — drives the honest pass bar (ENGLISH passes at 70, not 60). */
  courseType?: string;
}

export interface MatchedRow extends ExtractedRow {
  /** #5 — set when the two vision reads disagreed on this row (or one read
   *  dropped it). UI must show a "verify against the sheet" badge and never
   *  pre-check the row. */
  uncertain?: boolean;
  otherGrade?: number | null;
  match: UserCourseLite | null;
  /**
   * How confident the match is:
   * - "code"  = exact course-code match (high confidence)
   * - "name"  = exact normalized-name match (high confidence)
   * - "fuzzy" = risky substring/superset name collision — MUST be confirmed by
   *   the student, never auto-applied (a truncated OCR name like an intro
   *   course can otherwise bind to its advanced variant and overwrite it)
   * - "none"  = no match; student picks manually.
   * - "manual" = the STUDENT picked this course for the row on the review
   *   screen (#5, 13.8). The most confident kind there is — a human read the
   *   sheet and said so — so it is treated exactly like a code match.
   */
  matchKind: "code" | "name" | "fuzzy" | "none" | "manual";
  /** True when the sheet's grade differs from what's already recorded. */
  changesGrade: boolean;
  /**
   * More than one of the student's courses could be this row (a retake sharing
   * a code, or several names colliding on the fragment). Even with a match set,
   * the UI must NOT auto-apply an ambiguous row.
   */
  ambiguous: boolean;
  /**
   * Re-upload diff (SC-4): the sheet's grade REPLACES a different grade that is
   * already recorded (both non-null). Filling an empty grade is not an overwrite.
   * Overwrites are never pre-checked — the student approves each one explicitly.
   */
  overwritesGrade: boolean;
  /**
   * Safe to pre-select for one-click apply: a high-confidence, unambiguous
   * match that actually changes the grade. Fuzzy/ambiguous/overwrite rows are false.
   */
  autoApplySafe: boolean;
}

export function matchExtractedToCourses(
  rows: ExtractedRow[],
  userCourses: UserCourseLite[],
): MatchedRow[] {
  // Group by code so retakes (same code appearing twice) are detected, not
  // silently collapsed to whichever course happened to be last in the list.
  const byCode = new Map<string, UserCourseLite[]>();
  for (const c of userCourses) {
    const key = c.courseCode.replace(/\s/g, "");
    if (!key) continue;
    const list = byCode.get(key);
    if (list) list.push(c);
    else byCode.set(key, [c]);
  }
  const withNorm = userCourses.map((c) => ({ c, norm: normalizeName(c.nameHe) }));

  return rows.map((r) => {
    let match: UserCourseLite | null = null;
    let matchKind: MatchedRow["matchKind"] = "none";
    let ambiguous = false;

    if (r.courseCode) {
      const hits = byCode.get(r.courseCode.replace(/\s/g, ""));
      if (hits && hits.length > 0) {
        // Retake: prefer the not-yet-graded instance, but flag it so the
        // student confirms which sitting the grade belongs to.
        match = hits.find((h) => h.currentGrade == null) ?? hits[0]!;
        matchKind = "code";
        ambiguous = hits.length > 1;
      }
    }
    if (!match) {
      const norm = normalizeName(r.courseName);
      if (norm.length >= 4) {
        const exact = withNorm.filter((x) => x.norm === norm);
        if (exact.length >= 1) {
          match = exact[0]!.c;
          matchKind = "name";
          ambiguous = exact.length > 1; // two courses with the same name
        } else if (norm.length >= 8) {
          // Only allow a substring/superset match when it is LONG (short
          // fragments like "מבוא" collide with everything) and UNAMBIGUOUS
          // (exactly one candidate). Even then it is "fuzzy" — never auto-applied.
          const contains = withNorm.filter(
            (x) => x.norm.includes(norm) || norm.includes(x.norm),
          );
          if (contains.length === 1) {
            match = contains[0]!.c;
            matchKind = "fuzzy";
          } else if (contains.length > 1) {
            ambiguous = true; // multiple plausible courses → force manual choice
          }
        }
      }
    }

    const changesGrade = match != null && r.grade != null && match.currentGrade !== r.grade;
    const overwritesGrade =
      changesGrade && match != null && match.currentGrade != null;
    return {
      ...r,
      match,
      matchKind,
      changesGrade,
      ambiguous,
      overwritesGrade,
      autoApplySafe:
        changesGrade &&
        !ambiguous &&
        !overwritesGrade &&
        (matchKind === "code" || matchKind === "name"),
    };
  });
}

// =========================================================================
// #5 (13.8) — the STUDENT corrects a row before applying.
//
// The review screen used to be read-only. It printed "כנראה ציון אחד או יותר
// נקרא לא נכון — עברו על השורות לפני האישור" and then offered no way to fix
// one: the only choice was to tick a row you knew was wrong, or drop it. Ariel
// scanned his real sheet and hit exactly that wall.
//
// The edit is applied to the SAME MatchedRow the apply loop reads, and every
// match-dependent flag is re-derived here — so there is no shadow copy of the
// student's correction that can be discarded on save.
// =========================================================================

export interface MatchedRowEdit {
  /** 0–100, or null to clear. */
  grade?: number | null;
  /** 0–20. Only ever persisted for an ADDITION (a row with no match) — a
   *  matched course takes its credits from the catalog. */
  credits?: number | null;
  /** Re-bind the row to a different course of the student's, or null to make it
   *  an off-plan addition. A course the student picked by hand is the most
   *  confident match there is, so it becomes matchKind "manual". */
  match?: UserCourseLite | null;
}

/**
 * Apply a student's correction to a scanned row. Returns the SAME object
 * (reference-equal) when the edit is out of range — garbage never reaches
 * state, and callers can use the identity check to know nothing changed.
 */
export function reviseMatchedRow(row: MatchedRow, edit: MatchedRowEdit): MatchedRow {
  const next: MatchedRow = { ...row };

  if ("grade" in edit) {
    const g = edit.grade;
    if (g == null) {
      next.grade = null;
    } else if (Number.isFinite(g) && g >= 0 && g <= 100) {
      next.grade = g;
    } else {
      return row; // out of range — reject, keep what was there
    }
    // A human just read the number off the sheet and typed it. The "our two
    // reads disagreed" flag is answered by that; leaving it up would keep
    // shouting about a question the student already settled.
    next.uncertain = false;
    next.otherGrade = null;
  }

  if ("credits" in edit) {
    const c = edit.credits;
    if (c == null) next.credits = null;
    else if (Number.isFinite(c) && c >= 0 && c <= 20) next.credits = c;
    else return row;
  }

  if ("match" in edit) {
    next.match = edit.match ?? null;
    next.matchKind = edit.match ? "manual" : "none";
    // The student chose; there is nothing left to be ambiguous about.
    next.ambiguous = false;
  }

  const changesGrade =
    next.match != null && next.grade != null && next.match.currentGrade !== next.grade;
  next.changesGrade = changesGrade;
  next.overwritesGrade = changesGrade && next.match?.currentGrade != null;
  next.autoApplySafe =
    changesGrade &&
    !next.ambiguous &&
    !next.overwritesGrade &&
    (next.matchKind === "code" || next.matchKind === "name" || next.matchKind === "manual");
  return next;
}

/**
 * The vision system prompt — read ONLY what is on the sheet, never invent.
 * Written against the REAL TAU "אישור קורסים וציונים" layout (verified on an
 * actual transcript, July 2026): RTL table, zero-padded grades, *** for
 * in-progress, a teaching-mode column that must not leak into names.
 */
export const GRADE_SHEET_SYSTEM = `אתה קורא "אישור קורסים וציונים" רשמי של אוניברסיטת תל אביב (צילום או PDF, עברית, כיוון ימין-לשמאל).

מבנה המסמך:
- כותרות-סמסטר בצורת: שנה"ל תש… סמסטר YYYY/N (למשל "סמסטר 2025/1"). כל שורות הקורסים שמתחת שייכות לסמסטר הזה, עד לכותרת-הסמסטר הבאה.
- בטבלת הקורסים, סדר העמודות מימין לשמאל: מס' קורס (בפורמט NNNN-NNNN) · שם הקורס · ציון קובע · אופן הוראה · שעות סמס' · משקל · הערות.
- עמודת "ציון קובע" מודפסת בריפוד אפסים לשלוש ספרות: 089 פירושו 89, 096 פירושו 96. החזר תמיד את המספר האמיתי (89) בלי אפס מוביל.
- *** בעמודת הציון = הקורס עדיין בלימוד ואין לו ציון. אל תמציא ציון: grade=null ו-inProgress=true.
- inProgress=true אך ורק כשבעמודת "ציון קובע" של אותה שורה מופיע *** או שהיא ריקה לגמרי. אם מודפס באותה שורה ציון מספרי — inProgress=false תמיד, והחזר את המספר. שורה עם ציון מספרי לעולם אינה "בלימוד".
- לפעמים מודפסות שתי שורות לאותו קורס (שיעור ותרגיל, או חזרה על קורס בסמסטר אחר). החזר כל שורה בנפרד, עם ה-semester שלה ועם הציון שמופיע בשורה שלה בלבד — אל תעתיק ציון משורה אחת לשנייה ואל תאחד אותן.
- עמודת "אופן הוראה" מכילה קיצורים כמו ש', ת', ש'+ת', שו"ת — זה סוג השיעור, לא חלק משם הקורס. לעולם אל תכלול אותם ב-courseName.
- גם עמודת "הערות" (למשל "לא לשקלול") אינה חלק משם הקורס.
- דלג על שורות שאינן קורסים: "ממוצע משוקלל…", "ממוצע בחוג", "מפתח סימולי…", "סיכום מצב לימודים", כותרות עמוד וכותרות הטבלה עצמן. אבל: אם מופיעה שורת "ממוצע משוקלל" עם מספר — החזר את המספר בשדה printedAverage (מספר בלבד, למשל 95.7). אם אין — printedAverage=null.
- קריטי: קרא את הטבלה שורה-אחר-שורה. הציון של קורס נמצא באותה שורה אופקית של שם-הקורס — לעולם אל תיקח ציון משורה סמוכה. לפני שתחזיר, ודא ששייכת לכל קורס את הציון שבשורה שלו בדיוק.
- שורת "דרישות כלל אוניברסיטאיות" אינה קורס — אל תכניס אותה ל-rows. אבל אם כתוב בה "אנגלית: <רמה>" (למשל "אנגלית: מתקדמים ב'-מיון"), החזר את מילות-הרמה בלבד ("מתקדמים ב'") בשדה englishLevelLabel. בלי המילה "מיון" ובלי מספר. אם אין שורה כזו — englishLevelLabel=null.

החזר JSON בלבד, בפורמט:
{"rows":[{"courseCode":"0651-1001" או null,"courseName":"שם הקורס","grade":89 או null,"credits":4 או null,"passText":"עובר" או null,"semester":"2025/1" או null,"inProgress":false}],"englishLevelLabel":"מתקדמים ב'" או null,"printedAverage":95.7 או null}

כללים:
- חלץ אך ורק את מה שכתוב במסמך — אל תמציא, אל תשלים ואל תנחש ציון שלא מופיע.
- כל שורת קורס בטבלה חייבת להופיע ב-rows — כולל ציונים נמוכים, קורסי-פטור וקורסים בלימוד. אל תדלג על אף קורס.
- "עובר"/"נכשל"/"פטור" הולכים ל-passText ולא ל-grade.
- credits = עמודת "משקל".
- אם שדה לא ברור — null. אל תוסיף שום טקסט מחוץ ל-JSON.`;

// =========================================================================
// Course-lifecycle helpers (#22/#25/#30) — pure, shared by the /record
// scanner and the onboarding catalog match. Every status the scanner would
// write is decided HERE, so it can be DECLARED to the student before applying
// (the "no silent automation" rule of #30).
// =========================================================================

import { ENGLISH_CONFIG, CREDIT_REQUIREMENTS } from "@/lib/constants";

export type ApplyDecision = {
  grade: number | null;
  status: "COMPLETED" | "FAILED" | "EXEMPT";
};

/**
 * Exactly what would be written if this row were applied — or null when the
 * row is not applicable (no match, or a still-in-progress *** row). ENGLISH
 * courses pass at 70, everything else at 60, so a 65 in English is honestly
 * FAILED instead of a silent COMPLETED (adversarial-critique core fix).
 */
export function decideApplication(row: MatchedRow): ApplyDecision | null {
  if (!row.match) return null;
  if (row.grade != null) {
    const bar =
      row.match.courseType === "ENGLISH"
        ? ENGLISH_CONFIG.COURSE_PASSING_GRADE
        : CREDIT_REQUIREMENTS.PASSING_GRADE;
    return { grade: row.grade, status: row.grade >= bar ? "COMPLETED" : "FAILED" };
  }
  if (row.passText) {
    if (row.passText.includes("פטור")) return { grade: null, status: "EXEMPT" };
    if (row.passText.includes("נכשל")) return { grade: null, status: "FAILED" };
    return { grade: null, status: "COMPLETED" }; // "עובר"
  }
  return null; // *** in-progress — nothing to apply
}

// passBarFor moved to constants.ts (PERF1) — re-exported for scanner callers.
export { passBarFor } from "@/lib/constants";

/**
 * #28 — what would be written for a row that matched NOTHING in the plan.
 *
 * Mandatory courses are seeded into every plan at onboarding, so a scanned
 * mandatory row always finds a `match` and rides the bulk apply. An ELECTIVE
 * the student picked themselves (דוגרי, משבר האקלים וקיימות, a Python course…)
 * has no UserCourse yet, so `match` is null and `decideApplication` returns
 * null — which used to make the row un-checkable and invisible to "apply
 * selected". The student pressed apply, saw "עודכנו N קורסים", and their
 * electives were simply never recorded. That is the data-loss shape of #28.
 *
 * This decides the row's honest outcome as an ADDITION, so the scanner can put
 * it through the same checkbox + bulk apply as every other row. Returns null
 * for a row that is already matched (that's an update, not an addition) or has
 * nothing to record yet (*** in-progress, or no grade and no pass mark).
 */
export type ScannedAddition = {
  courseCode: string | null;
  courseName: string;
  credits: number | null;
  grade: number | null;
  status: "COMPLETED" | "FAILED" | "EXEMPT";
};

export function decideAddition(row: MatchedRow): ScannedAddition | null {
  if (row.match) return null; // matched → an update, handled by decideApplication
  const base = {
    courseCode: row.courseCode ?? null,
    courseName: row.courseName,
    credits: row.credits ?? null,
  };
  if (row.grade != null) {
    // The row is off-catalog, so there is no courseType to consult. English is
    // the only type whose bar differs (70, not 60) — detect it by name, the
    // same way printedAverageMismatch does, so a 65 in an English elective is
    // never recorded as a silent COMPLETED.
    const bar = /אנגלית|english/i.test(row.courseName)
      ? ENGLISH_CONFIG.COURSE_PASSING_GRADE
      : CREDIT_REQUIREMENTS.PASSING_GRADE;
    return { ...base, grade: row.grade, status: row.grade >= bar ? "COMPLETED" : "FAILED" };
  }
  if (row.passText) {
    if (row.passText.includes("פטור")) return { ...base, grade: null, status: "EXEMPT" };
    if (row.passText.includes("נכשל")) return { ...base, grade: null, status: "FAILED" };
    return { ...base, grade: null, status: "COMPLETED" }; // "עובר"
  }
  return null; // *** in-progress — nothing to record yet
}

/**
 * #28 — where an added row lands in the plan. The sheet's header is an ACADEMIC
 * year + sitting ("2025/1"), not a study year, so the study year comes from the
 * student's own start year. Sitting 3 is the summer sitting — mapping it to
 * FALL (as the old inline code did) filed every summer elective in the wrong
 * semester. Falls back to the student's current year, never a blind 1.
 */
export function placeScannedRow(
  sheetSemester: string | null | undefined,
  startYear: number | null | undefined,
  currentYear: number | null | undefined,
): { plannedYear: number; plannedSemester: "FALL" | "SPRING" | "SUMMER" } {
  const [yearPart, sitting] = (sheetSemester ?? "").split("/");
  const sheetYear = Number(yearPart);
  const plannedYear =
    Number.isFinite(sheetYear) && sheetYear > 0 && startYear
      ? Math.min(3, Math.max(1, sheetYear - startYear + 1))
      : Math.min(3, Math.max(1, currentYear ?? 1));
  return {
    plannedYear,
    plannedSemester: sitting === "2" ? "SPRING" : sitting === "3" ? "SUMMER" : "FALL",
  };
}

/**
 * "2025/1" → { plannedYear, plannedSemester }. Ranks the sheet's OWN semester
 * headers chronologically — the earliest year block = year 1 — so placement
 * never depends on guessing which calendar year maps to which study year.
 */
export function mapSheetSemesters(
  rows: ExtractedRow[],
): Map<string, { plannedYear: number; plannedSemester: "FALL" | "SPRING" | "SUMMER" }> {
  const keys = Array.from(
    new Set(
      rows
        .map((r) => r.semester)
        .filter((s): s is string => !!s && /^\d{4}\/\d$/.test(s)),
    ),
  );
  const parsed = keys
    .map((k) => ({ k, y: Number(k.split("/")[0]), n: Number(k.split("/")[1]) }))
    .sort((a, b) => a.y - b.y || a.n - b.n);
  const years = Array.from(new Set(parsed.map((p) => p.y))).sort((a, b) => a - b);
  const map = new Map<
    string,
    { plannedYear: number; plannedSemester: "FALL" | "SPRING" | "SUMMER" }
  >();
  for (const p of parsed) {
    map.set(p.k, {
      plannedYear: Math.min(3, years.indexOf(p.y) + 1), // YEAR_CONFIG knows 1-3
      plannedSemester: p.n === 2 ? "SPRING" : p.n === 3 ? "SUMMER" : "FALL",
    });
  }
  return map;
}

/** English level from a sheet's "אנגלית: <רמה>-מיון" line, or null. */
export function mapEnglishLevelLabel(
  label: string | null | undefined,
): "EXEMPT" | "ADVANCED_B" | "ADVANCED_A" | "BASIC" | "PRE_BASIC" | null {
  if (!label) return null;
  const s = label.replace(/["'׳״’]/g, "");
  if (s.includes("פטור")) return "EXEMPT";
  if (s.includes("מתקדמים ב")) return "ADVANCED_B";
  if (s.includes("מתקדמים א")) return "ADVANCED_A";
  if (s.includes("טרום")) return "PRE_BASIC";
  if (s.includes("בסיסי")) return "BASIC";
  return null;
}

export interface CatalogLite {
  code: string;
  nameHe: string;
}

/** Match scanned rows to catalog courses (for onboarding) — code first, then
 *  normalized name; null when neither hits. */
export function matchExtractedToCatalog<T extends CatalogLite>(
  rows: ExtractedRow[],
  catalog: T[],
): { row: ExtractedRow; course: T | null }[] {
  const byCode = new Map(catalog.map((c) => [c.code.replace(/\s/g, ""), c]));
  // Name index WITH collision detection: a normalized name shared by two+ catalog
  // courses is ambiguous, so a code-less scanned row must NOT silently bind to an
  // arbitrary one (it would grade the wrong course). Only names that are unique in
  // the catalog auto-match by name; a code match always wins first (#audit-r3).
  const nameCount = new Map<string, number>();
  for (const c of catalog) {
    const n = normalizeName(c.nameHe);
    nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  const byName = new Map<string, T>();
  for (const c of catalog) {
    const n = normalizeName(c.nameHe);
    if (nameCount.get(n) === 1) byName.set(n, c);
  }
  return rows.map((row) => {
    const code = row.courseCode?.replace(/\s/g, "");
    const course =
      (code && byCode.get(code)) || byName.get(normalizeName(row.courseName)) || null;
    return { row, course };
  });
}
