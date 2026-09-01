// =========================================================================
// Honest progress for the AI scanners
// =========================================================================
// Ariel: "קריאת 3010 איטית". Part of that is real latency, fixed elsewhere
// (upload.ts, gemini-client.ts, the route). Part of it is that a scan which
// takes twenty seconds and a scan which has crashed look EXACTLY the same:
// one spinner, one frozen label, no clock. People tap again, and a second
// upload starts — which is both a wasted scan from a ten-a-day quota and a
// slower answer for the first one.
//
// What this does NOT do is invent a percentage. We do not know how far along
// Google is, and a bar that crawls to 90% and sits there is a lie that gets
// noticed. It reports the stage we genuinely know we are in, and it counts the
// seconds, which is the one number we can state truthfully.

export type ScanStage = "prepare" | "upload" | "read";
export type ScanSubject = "form" | "sheet" | "syllabus" | "photo";

export interface ScanProgressCopy {
  label: string;
  /** Shown once the wait stops feeling instant, so nobody thinks it hung. */
  hint: string | null;
}

/** After this long a silent spinner starts reading as a crash. */
export const REASSURE_AFTER_S = 6;
/** Past this, say so plainly rather than let them wonder. */
export const LONG_AFTER_S = 25;

const READ_HE: Record<ScanSubject, string> = {
  form: "קוראים את הטופס…",
  sheet: "קוראים את הגיליון…",
  syllabus: "קוראים את הסילבוס…",
  photo: "מסתכלים על התמונה…",
};
const READ_EN: Record<ScanSubject, string> = {
  form: "Reading the form…",
  sheet: "Reading the transcript…",
  syllabus: "Reading the syllabus…",
  photo: "Looking at the image…",
};

export function scanProgressCopy(
  stage: ScanStage,
  elapsedSeconds: number,
  isHe: boolean,
  subject: ScanSubject = "form",
): ScanProgressCopy {
  const label = isHe
    ? { prepare: "מכינים את הקובץ…", upload: "שולחים לקריאה…", read: READ_HE[subject] }[stage]
    : { prepare: "Preparing the file…", upload: "Sending it over…", read: READ_EN[subject] }[stage];

  let hint: string | null = null;
  if (elapsedSeconds >= LONG_AFTER_S) {
    hint = isHe
      ? "לוקח יותר מהרגיל — אנחנו עדיין עובדים על זה. אל תעלו שוב, זה רק יאט את התשובה."
      : "Longer than usual — still working. Don't re-upload, it only slows the answer down.";
  } else if (elapsedSeconds >= REASSURE_AFTER_S) {
    hint = isHe
      ? "קריאה לוקחת בדרך כלל 10–30 שניות."
      : "Reading usually takes 10–30 seconds.";
  }
  return { label, hint };
}
