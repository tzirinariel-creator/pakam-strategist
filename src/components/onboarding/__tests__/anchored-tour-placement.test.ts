import { describe, it, expect } from "vitest";
import { computeTipTop } from "@/components/onboarding/anchored-tour";

/**
 * #16 (13.8) — "תסתכל בסיור איך חלון ההסבר למעלה ולא נוח לראות מה כתוב".
 *
 * The tour card was placed with `bottom: vh - rect.top + …` whenever it went
 * above its target, and nothing clamped it to the viewport. The invariant that
 * was missing, and is the point of every test here: WHATEVER the target's
 * geometry, the whole card must end up on screen.
 */
const PAD = 8;
const MARGIN = 12;
const VH = 800;

/** The property the old code violated. */
function assertFullyVisible(top: number, tipH: number, vh = VH) {
  expect(top).toBeGreaterThanOrEqual(MARGIN);
  expect(top + tipH).toBeLessThanOrEqual(vh - MARGIN);
}

describe("computeTipTop — the card is always on screen", () => {
  it("sits below a short target near the top", () => {
    const top = computeTipTop({ rectTop: 100, rectBottom: 160, tipH: 180, vh: VH, pad: PAD });
    expect(top).toBe(160 + PAD + 8);
    assertFullyVisible(top, 180);
  });

  it("sits above a target near the BOTTOM, where below would overflow", () => {
    const top = computeTipTop({ rectTop: 600, rectBottom: 700, tipH: 180, vh: VH, pad: PAD });
    expect(top).toBe(600 - PAD - 8 - 180);
    assertFullyVisible(top, 180);
  });

  it("THE REPORTED BUG: a tall target starting near the top of the screen", () => {
    // "המצב שלי" — the first dashboard step. Its bottom is far down, so the old
    // code chose "above"; its top is small, so the card was thrown off the top
    // edge and only its footer remained visible.
    const top = computeTipTop({ rectTop: 40, rectBottom: 760, tipH: 200, vh: VH, pad: PAD });
    assertFullyVisible(top, 200);
  });

  it("handles a target taller than the whole viewport", () => {
    const top = computeTipTop({ rectTop: -200, rectBottom: 1200, tipH: 200, vh: VH, pad: PAD });
    assertFullyVisible(top, 200);
  });

  it("still starts on screen when the card itself is taller than the viewport", () => {
    // Cannot fit fully; it must at least begin at the top so the TITLE is the
    // part you see, and the card scrolls internally (max-h + overflow-y).
    const top = computeTipTop({ rectTop: 300, rectBottom: 400, tipH: 900, vh: VH, pad: PAD });
    expect(top).toBe(MARGIN);
  });

  it("never returns a position off-screen, across a sweep of geometries", () => {
    for (let rectTop = -300; rectTop <= 900; rectTop += 60) {
      for (const h of [60, 300, 720]) {
        for (const tipH of [120, 200, 320]) {
          const top = computeTipTop({ rectTop, rectBottom: rectTop + h, tipH, vh: VH, pad: PAD });
          expect(top, `rectTop=${rectTop} h=${h} tipH=${tipH}`).toBeGreaterThanOrEqual(MARGIN);
          // A card taller than the viewport is the one case that cannot fit;
          // it is still required to START on screen, which the line above pins.
          if (tipH + MARGIN * 2 <= VH) assertFullyVisible(top, tipH);
        }
      }
    }
  });
});
