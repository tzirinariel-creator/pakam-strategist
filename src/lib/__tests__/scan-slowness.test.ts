/** @vitest-environment jsdom */
// =========================================================================
// "קריאת 3010 איטית"
// =========================================================================
// The note was open and marked "לא נחקר". Investigating it turned up four
// separate causes, and this file pins each one so none of them can drift back.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scanProgressCopy, REASSURE_AFTER_S, LONG_AFTER_S } from "@/lib/scan-progress";

// -------------------------------------------------------------------------
// 1. The downscale asked the wrong question
// -------------------------------------------------------------------------
// It was gated on FILE SIZE. A photo of a form is mostly flat white paper, so
// a 12-megapixel shot often compresses under the old 2.5MB gate and went up at
// full resolution — four times the pixels the model needs, paid for twice
// (the student's upload, then the image tokens).

interface FakeBitmap {
  width: number;
  height: number;
  close?: () => void;
}

function installCanvas() {
  const drawn: Array<{ w: number; h: number }> = [];
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  proto.getContext = function () {
    const self = this as unknown as HTMLCanvasElement;
    return {
      drawImage: () => drawn.push({ w: self.width, h: self.height }),
    };
  };
  proto.toDataURL = () => "data:image/jpeg;base64,ZmFrZQ==";
  return drawn;
}

function fakeFile(type: string, size: number): File {
  const f = new File(["x"], "f", { type });
  Object.defineProperty(f, "size", { value: size });
  Object.defineProperty(f, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
  return f;
}

describe("the scanner sends the pixels it needs and no more", () => {
  let drawn: Array<{ w: number; h: number }>;

  beforeEach(() => {
    drawn = installCanvas();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("shrinks a 12MP photo even when it compressed under the old size gate", async () => {
    // 4032x3024 at 2.1MB — under 2,500,000, so the shipped code sent it whole.
    vi.stubGlobal("createImageBitmap", async (): Promise<FakeBitmap> => ({ width: 4032, height: 3024 }));
    const { fileToBase64 } = await import("@/lib/upload");
    await fileToBase64(fakeFile("image/jpeg", 2_100_000));

    expect(drawn).toHaveLength(1);
    expect(Math.max(drawn[0]!.w, drawn[0]!.h)).toBe(2000);
  });

  it("leaves an already-small image alone instead of re-compressing it", async () => {
    vi.stubGlobal("createImageBitmap", async (): Promise<FakeBitmap> => ({ width: 900, height: 700 }));
    const { fileToBase64 } = await import("@/lib/upload");
    const out = await fileToBase64(fakeFile("image/jpeg", 500_000));

    expect(drawn).toHaveLength(0);
    expect(out.mime).toBe("image/jpeg");
  });

  // -----------------------------------------------------------------------
  // 2. A failed decode killed the whole scan
  // -----------------------------------------------------------------------
  // `createImageBitmap` cannot decode HEIC outside Safari, and `image/heic` is
  // in our OWN accept list. The throw escaped to the caller, which reports
  // "the scan didn't work" — for a file the server handles fine. A downscale
  // is an optimisation; failing to optimise must not fail the operation.
  it("still sends the file when the browser cannot decode it (HEIC on Chrome)", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new DOMException("The source image cannot be decoded.");
    });
    const { fileToBase64 } = await import("@/lib/upload");
    const out = await fileToBase64(fakeFile("image/heic", 3_000_000));

    expect(out.b64.length).toBeGreaterThan(0);
    expect(out.mime).toBe("image/heic");
  });

  it("passes a PDF through untouched — the model reads it natively", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("should never be called for a PDF");
    });
    const { fileToBase64 } = await import("@/lib/upload");
    const out = await fileToBase64(fakeFile("application/pdf", 4_000_000));
    expect(out.mime).toBe("application/pdf");
    expect(drawn).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
// 3. The wait was unexplained
// -------------------------------------------------------------------------
// A scan that is working and a scan that has crashed looked identical: one
// spinner, one frozen label, no clock. People re-upload, which burns a second
// scan from a ten-a-day quota AND makes the first answer arrive later.

describe("the wait says what it is doing", () => {
  it("names the stage rather than freezing on one word", () => {
    expect(scanProgressCopy("prepare", 0, true).label).not.toBe(
      scanProgressCopy("upload", 0, true).label,
    );
    expect(scanProgressCopy("upload", 0, true).label).not.toBe(
      scanProgressCopy("read", 0, true).label,
    );
  });

  it("names the document, so four scanners do not all say 'reading…'", () => {
    const read = (s: "form" | "sheet" | "syllabus") => scanProgressCopy("read", 0, true, s).label;
    expect(new Set([read("form"), read("sheet"), read("syllabus")]).size).toBe(3);
  });

  it("says nothing extra while the wait still feels instant", () => {
    expect(scanProgressCopy("read", 0, true).hint).toBeNull();
    expect(scanProgressCopy("read", REASSURE_AFTER_S - 1, true).hint).toBeNull();
  });

  it("sets an expectation once the silence gets uncomfortable", () => {
    const hint = scanProgressCopy("read", REASSURE_AFTER_S, true).hint;
    expect(hint).toBeTruthy();
    expect(hint).toMatch(/10–30/);
  });

  it("tells them not to re-upload once it is genuinely slow", () => {
    const hint = scanProgressCopy("read", LONG_AFTER_S, true).hint ?? "";
    expect(hint).toMatch(/אל תעלו שוב/);
  });

  it("never invents a percentage", () => {
    // A bar that crawls to 90% and sits there is a lie people notice. We do not
    // know how far along Google is, so we never claim to.
    for (const t of [0, 3, 10, 30, 120]) {
      for (const stage of ["prepare", "upload", "read"] as const) {
        const { label, hint } = scanProgressCopy(stage, t, true);
        expect(`${label} ${hint ?? ""}`).not.toMatch(/%/);
      }
    }
  });

  it("speaks English on the English side", () => {
    expect(scanProgressCopy("read", LONG_AFTER_S, false).hint).toMatch(/re-upload/);
  });
});
