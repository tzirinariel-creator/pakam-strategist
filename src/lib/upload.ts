// Client-side file → base64 for the AI scanners. Downscales large photos on a
// canvas so a phone shot fits the request limit; PDFs pass through as-is.

export async function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  if (file.type.startsWith("image/") && file.size > 2_500_000) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { b64: dataUrl.split(",")[1]!, mime: "image/jpeg" };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return { b64: btoa(bin), mime: file.type };
}

export const SCANNER_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
