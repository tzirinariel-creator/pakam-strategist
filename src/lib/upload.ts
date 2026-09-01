// =========================================================================
// Client-side file → base64 for the AI scanners
// =========================================================================
// Ariel: "קריאת 3010 איטית". Three separate reasons lived here.
//
// 1. THE DOWNSCALE WAS GATED ON FILE SIZE, NOT ON DIMENSIONS. A 12-megapixel
//    phone photo of a form is mostly flat white paper, so it often compresses
//    to about 2MB — under the old 2,500,000-byte gate — and went up at
//    4032×3024. That is four times the pixels the model needs to read a printed
//    table, and every one of them is paid for twice: once uploading over the
//    student's cellular connection, once as image tokens at the far end.
//    The question that decides whether an image is too big is how many pixels
//    it has, so that is now the question being asked.
//
// 2. A FAILED DECODE KILLED THE WHOLE SCAN. `createImageBitmap` cannot decode
//    HEIC outside Safari, and `image/heic` is in our own accept list. On
//    desktop Chrome the throw escaped to the caller's catch, which reports
//    "the scan didn't work" — for a file the server would have handled fine.
//    A downscale is an OPTIMISATION; failing to optimise must never fail the
//    operation, so it now falls through to the original bytes.
//
// 3. SMALL IMAGES WERE RE-ENCODED FOR NOTHING. A 900px screenshot got a full
//    canvas round-trip and a JPEG re-compression that only ever lost detail.

/** Longest edge we send. An A4 page at 2000px is ~170 DPI — plenty for printed
 *  text, and a quarter of the bytes of a modern phone sensor. */
const MAX_EDGE = 2000;

/** Below this, a re-encode costs more quality than it saves bytes. */
const MIN_BYTES_TO_BOTHER = 400_000;

function toB64(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function raw(file: File): Promise<{ b64: string; mime: string }> {
  return { b64: toB64(new Uint8Array(await file.arrayBuffer())), mime: file.type };
}

export async function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  // PDFs go through untouched — the model reads them natively and they are
  // already a fraction of a photo's size.
  if (!file.type.startsWith("image/") || file.size < MIN_BYTES_TO_BOTHER) {
    return raw(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    // Never upscale: an image already within budget is sent as it arrived.
    const scale = Math.min(1, MAX_EDGE / longest);
    if (scale === 1 && file.size < 2_500_000) {
      bitmap.close?.();
      return raw(file);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const b64 = dataUrl.split(",")[1];
    if (!b64) throw new Error("empty encode");
    return { b64, mime: "image/jpeg" };
  } catch {
    // HEIC on Chrome, a tainted or oversized canvas, a decoder that gave up —
    // all of them mean "we could not shrink it", none of them mean "give up".
    return raw(file);
  }
}

export const SCANNER_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
