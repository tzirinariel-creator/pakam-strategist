// =========================================
// AI grade-sheet scanner — image → extracted rows
// =========================================
// The student uploads a photo/PDF of their TAU grade sheet; Gemini vision
// reads it and returns structured rows. This route only EXTRACTS — nothing is
// written anywhere. Applying a grade is a separate, explicit per-row action in
// the UI through plan.updateCourse (ownership + demo guards there).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { generateGeminiVision } from "@/lib/ai/gemini-client";
import { detectProvider } from "@/lib/ai/provider";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";
import {
  parseExtraction,
  parseEnglishLevelLabel,
  parsePrintedAverage,
  mapEnglishLevelLabel,
  mergeDoubleRead,
  printedAverageMismatch,
  GRADE_SHEET_SYSTEM,
  CENSUS_SYSTEM,
  parseCodeCensus,
  censusGap,
  applyCensusCandidates,
  takeRejectedRowCount,
} from "@/lib/grade-sheet";
import type { ScanDiagnostics } from "@/lib/grade-sheet";
import { extractSheetFromPdf } from "@/lib/grade-sheet-pdf";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const scanInputSchema = z.object({
  // ~4MB of base64 — matches serverless body limits; the client compresses.
  imageBase64: z.string().min(100).max(5_000_000),
  mimeType: z.string().refine((m) => ALLOWED_MIME.has(m), "Unsupported file type"),
});

export async function POST(request: NextRequest) {
  const locale = request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "he";
  const errs =
    locale === "en"
      ? {
          noKey: "Scanning needs a Gemini key — add a free one in settings, or try again later when the shared key is available.",
          unreadable: "Couldn't read the sheet — try a sharper, straighter photo of the grades table.",
          rateLimit: "Scan limit reached for now — try again later.",
          sharedBusy: "The shared key is busy right now — you have not hit any limit of your own. Try again in a few minutes, or add a free Gemini key in settings for a private quota.",
          badKey: "The Gemini key was rejected — check the key in settings (or remove it to use the shared key).",
          unavailable: "The scanner is temporarily unavailable — please try again later.",
        }
      : {
          noKey: "הסריקה צריכה מפתח Gemini — הוסיפו מפתח חינמי בהגדרות, או נסו שוב מאוחר יותר כשהמפתח המשותף פנוי.",
          unreadable: "לא הצלחנו לקרוא את הגיליון — נסו צילום חד וישר יותר של טבלת הציונים.",
          rateLimit: "הגעתם למגבלת הסריקות לעכשיו — נסו שוב מאוחר יותר.",
          sharedBusy: "המפתח המשותף עמוס כרגע — לא הגעתם לשום מגבלה שלכם. אפשר לנסות שוב בעוד כמה דקות, או להוסיף מפתח Gemini חינמי בהגדרות ואז המכסה שלכם פרטית.",
          badKey: "מפתח ה-Gemini נדחה — בדקו את המפתח בהגדרות (או הסירו אותו כדי להשתמש במפתח המשותף).",
          unavailable: "הסורק אינו זמין כרגע — נסו שוב מאוחר יותר.",
        };

  try {
    // Auth — verified against the auth server, like every AI route.
    const supabase = await createServerSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Demo is read-only AND must not drain the shared vision quota.
    if (isDemoEmail(authUser.email)) {
      return NextResponse.json({ error: DEMO_READONLY_MESSAGE }, { status: 403 });
    }

    const parsed = scanInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { supabaseId: authUser.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Key resolution: the student's own key IF it's a Gemini key (vision needs
    // Gemini), else the shared free key, else a clear 412.
    let encryptedKey: string | null = null;
    let usingSharedKey = false;
    if (user.encryptedClaudeKey) {
      try {
        if (detectProvider(decrypt(user.encryptedClaudeKey)) === "gemini") {
          encryptedKey = user.encryptedClaudeKey;
        }
      } catch {
        /* fall through to shared */
      }
    }
    if (!encryptedKey && process.env.GEMINI_SHARED_KEY) {
      usingSharedKey = true;
      encryptedKey = encrypt(process.env.GEMINI_SHARED_KEY);
    }
    if (!encryptedKey) {
      return NextResponse.json({ error: errs.noKey }, { status: 412 });
    }

    // =====================================================================
    // THE EXACT PATH — read the PDF's own text layer before asking a model.
    // =====================================================================
    // Ariel, after the third scan lost real courses: "זה כבר שובר אמון עם
    // המשתמש ברגע שהוא נכנס … תסתכל רגע בזום אאוט ותראה מה הפתרון הכי טוב
    // שבוודאות יעבוד".
    //
    // The zoom-out: TAU issues this document as a generated PDF, not a photo.
    // Its text layer is perfectly regular, so a regex reads every row the same
    // way every time — and we can PROVE the read is complete by recomputing the
    // averages TAU printed on the sheet and checking they match to the cent.
    // A vision model cannot offer that guarantee; this can.
    //
    // Vision stays as the fallback for photographs and scans. It also costs a
    // quota slot; this path costs nothing, so it runs before the rate limit.
    if (parsed.data.mimeType === "application/pdf") {
      try {
        const exact = await extractSheetFromPdf(parsed.data.imageBase64);
        if (exact) return NextResponse.json(exact);
      } catch {
        // Any failure here is silent by design: it just means we ask the model,
        // exactly as before. An exact path that breaks must never break the scan.
      }
    }

    // Per-user daily quota — checked AFTER auth/validation/key-resolution so a
    // failed attempt (bad input 400, no key 412) never burns one of the 10
    // daily scans. checkRateLimit increments the counter, so it must run only on
    // a genuine scan attempt. (verification 4.7)
    const perUser = checkRateLimit(`scan-day:${authUser.id}`, {
      maxRequests: 10,
      windowSeconds: 86_400,
    });
    if (!perUser.allowed) {
      return NextResponse.json(
        { error: errs.rateLimit },
        { status: 429, headers: { "Retry-After": String(perUser.resetInSeconds) } },
      );
    }

    // אריאל, 3.9 — ביקורת סיכוני השקה שעשיתי בעצמי.
    //
    // שני המצבים האלה קיבלו את **אותה** הודעה, "הגעתם למגבלת הסריקות".
    // הראשון נכון: הסטודנט סרק עשר פעמים היום. השני שקרי: המכסה המשותפת
    // עמוסה, והוא אולי סרק פעם אחת. לומר לו שהוא הגיע למגבלה שלו זו טענה
    // שאי־אפשר לפעול לפיה — הוא ימתין ליום הבא במקום לנסות בעוד חמש דקות
    // או להוסיף מפתח חינמי משלו.
    //
    // ומה שראוי שאריאל ידע: `checkRateLimit` שומר מצב **בזיכרון של כל
    // מכונת Vercel בנפרד** — כתוב במפורש ב-rate-limit.ts. כלומר השומר
    // הגלובלי של 150 הוא בפועל 150 × מספר המכונות החמות, ואינו חוסם את
    // המכסה המשותפת. בבוקר עמוס המכסה של Google תיגמר לפניו, וה-429 שלה
    // ימופה לכאן. לכן ההפרדה בהודעות היא מה שמגן על הסטודנט — לא המספר.
    if (usingSharedKey) {
      const global = checkRateLimit("scan-day:__global__", {
        maxRequests: 150,
        windowSeconds: 86_400,
      });
      if (!global.allowed) {
        return NextResponse.json(
          { error: errs.sharedBusy },
          { status: 429, headers: { "Retry-After": String(global.resetInSeconds) } },
        );
      }
    }

    const text = await generateGeminiVision(
      encryptedKey,
      GRADE_SHEET_SYSTEM,
      locale === "en"
        ? "Extract the grade rows from this grade sheet."
        : "חלץ את שורות הציונים מגיליון הציונים הזה.",
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );

    const firstRows = parseExtraction(text);
    const rejectedRows = takeRejectedRowCount();
    if (!firstRows || firstRows.length === 0) {
      return NextResponse.json({ error: errs.unreadable }, { status: 422 });
    }

    // #5 — VERIFICATION PASS. A single vision read of a dense RTL table can
    // swap grades between adjacent rows or drop a row (this happened on a real
    // sheet: 89 landed on the wrong course). A second, task-different read —
    // "check each row against the image" — has a different error profile;
    // rows where the two reads disagree are flagged so nothing lands silently.
    let rows = firstRows.map((r) => ({ ...r }) as ReturnType<typeof mergeDoubleRead>[number]);
    // 14.8 — scan diagnostics. Ariel reported courses he HAS grades for coming
    // back "בלימוד", and the honest answer was that this was undiagnosable: the
    // vision model's output is never logged, so there was no way to tell "the
    // model didn't read the grade cell" from "the code lost it afterwards".
    // These counters are cheap and they split exactly that question. They carry
    // NO course names and NO grades — just shapes — so nothing personal leaves
    // the server that wasn't already going back to this same student.
    let verifyReadRows: number | null = null;
    let verifyFailed = false;
    try {
      const verifyText = await generateGeminiVision(
        encryptedKey,
        GRADE_SHEET_SYSTEM,
        (locale === "en"
          ? "VERIFY the following extraction against the sheet image, row by row. For every course, check that the grade belongs to THAT course's row (not a neighboring row) and that no course row is missing. Return the FULL corrected JSON in the same format.\n\nExtraction to verify:\n"
          : "בדוק את החילוץ הבא מול תמונת הגיליון, שורה-שורה. לכל קורס ודא שהציון שייך לשורה שלו בדיוק (לא לשורה שכנה) ושאף שורת-קורס לא חסרה. החזר את ה-JSON המלא והמתוקן באותו פורמט.\n\nהחילוץ לבדיקה:\n") +
          JSON.stringify({ rows: firstRows }),
        parsed.data.imageBase64,
        parsed.data.mimeType,
      );
      const verifyRows = parseExtraction(verifyText);
      verifyReadRows = verifyRows?.length ?? 0;
      if (verifyRows && verifyRows.length > 0) {
        rows = mergeDoubleRead(firstRows, verifyRows);
      }
    } catch {
      verifyFailed = true;
      // Verification is best-effort: if the second call fails (quota, blip),
      // the first read still ships — without confidence flags.
    }

    // 14.8 — THE CENSUS. Ariel scanned the same sheet twice, days apart, and
    // both times דוגרי (93) and משבר האקלים (94) never arrived, while
    // אסטרטגיה and the English course arrived with their grades stripped.
    // Nothing downstream could tell, because a row the model never returns
    // leaves no trace to notice.
    //
    // So this pass asks a deliberately EASIER question — codes and grades only,
    // no names, no ש״ס, no column stripping — and we compare. The answer is
    // never used as data: it cannot add a course or set a grade. It can only
    // raise a QUESTION the student answers, which is what keeps the iron rule
    // ("never invent a grade") intact while ending the silent loss.
    let gap: ReturnType<typeof censusGap> = { missingRows: [], missingGrades: [] };
    let censusFailed = false;
    try {
      const censusText = await generateGeminiVision(
        encryptedKey,
        CENSUS_SYSTEM,
        locale === "en"
          ? "List every course code on this sheet with its grade. Codes and grades only."
          : "רשום כל מספר קורס בגיליון עם הציון שלו. קודים וציונים בלבד.",
        parsed.data.imageBase64,
        parsed.data.mimeType,
      );
      gap = censusGap(rows, parseCodeCensus(censusText));
      // Offer what the census read as a one-tap candidate — never as a fact.
      rows = applyCensusCandidates(rows, gap);
    } catch {
      censusFailed = true;
      // Best-effort, exactly like the verify pass. A census that fails must
      // never make the scan look worse than it is — it just goes quiet.
    }

    // #5 — printed-average cross-check: computed weighted mean vs the ממוצע
    // printed on the sheet. A drift means a misread somewhere → banner.
    const printedAverage = parsePrintedAverage(text);
    const averageMismatch = printedAverageMismatch(rows, printedAverage);

    // #23 — the English level printed on the sheet (no number). Mapped to an enum
    // here; the client offers it as an explicit, declared change (no silent write).
    const englishLevel = mapEnglishLevelLabel(parseEnglishLevelLabel(text));

    const diagnostics: ScanDiagnostics = {
      semesters: Array.from(
        new Set(rows.map((r) => r.semester).filter((x): x is string => !!x)),
      ).sort(),
      /** Rows the FIRST vision pass returned. */
      firstReadRows: firstRows.length,
      /** Rows the VERIFY pass returned; null when it never ran. */
      verifyReadRows,
      /** The verify pass threw (quota/blip) — the first read shipped alone. */
      verifyFailed,
      /** Final rows carrying a numeric grade. */
      withGrade: rows.filter((r) => r.grade != null).length,
      /** Final rows with no grade — the "בלימוד" population. */
      withoutGrade: rows.filter((r) => r.grade == null).length,
      /** Rows the two passes disagreed about (grade present vs absent, or a
       *  row only one pass saw). This is the number that says "the code is
       *  losing it" as opposed to "the model never read it". */
      disputed: rows.filter((r) => (r as { uncertain?: boolean }).uncertain === true).length,
      rejectedRows,
      censusFailed,
      missingRows: gap.missingRows,
      missingGrades: gap.missingGrades,
    };

    return NextResponse.json({ rows, englishLevel, averageMismatch, diagnostics });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    // Distinguish real causes instead of blaming the photo (and making the user
    // burn scan quota re-shooting a sheet when the key/model is the problem).
    if (status === 429) {
      return NextResponse.json({ error: errs.rateLimit }, { status: 429 });
    }
    if (status === 400 || status === 401 || status === 403) {
      return NextResponse.json({ error: errs.badKey }, { status: 400 });
    }
    if (status === 404) {
      // Retired model — the #34 failure mode; surface it, don't hide it.
      console.error("[scan-grades] provider 404 (model retired?):", e);
      return NextResponse.json({ error: errs.unavailable }, { status: 503 });
    }
    // A genuinely unreadable sheet is already answered above (422, line ~147).
    // An UNEXPECTED error here is a server/provider/network failure — don't blame
    // the student's sheet photo for our outage (#12).
    console.error("[scan-grades] failed:", e);
    return NextResponse.json({ error: errs.unavailable }, { status: 503 });
  }
}
