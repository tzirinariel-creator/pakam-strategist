/** @vitest-environment jsdom */
// =========================================================================
// Neither portrait may spill past its medallion
// =========================================================================
// Ariel, twice — the second time explicitly saying the fix had not taken:
//   "הצבעים האלו מסביב למלך כמסגרת מלבנית חתוכים למטה במסך טעינה"
//   "המלבן הצבעוני מאחורי המלך במסך הטעינה עדיין חתוך למטה"
//
// Both portraits are a round medallion with a bust drawn under it, and both
// busts use the SAME path — M12 64 … Z — which ends on the viewBox floor at
// y=64. On the King that bust was clipped to the medallion circle. On the
// Referent it never was, so the teal shape ran past the round badge and the
// SVG viewport sliced it flat: a straight bottom edge under a circle, which is
// precisely "a coloured rectangle cut off at the bottom".
//
// The loader shows the viewer their OWN advisor. Fixing one portrait fixed it
// for the people who use that one and left the report standing for everybody
// else — which is why it came back a second time as "still".
//
// So this asserts the property on BOTH, by construction: any shape that
// reaches the viewBox floor has to be inside the medallion clip.

import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { PhilosopherKingCharacter } from "@/components/ui/philosopher-king-character";
import { ReferentCharacter } from "@/components/ui/referent-character";

afterEach(cleanup);

const PORTRAITS = [
  { name: "the Philosopher King", Char: PhilosopherKingCharacter },
  { name: "the Referent", Char: ReferentCharacter },
] as const;

/** Does this node sit inside a clipped group? */
function isClipped(el: Element): boolean {
  let p: Element | null = el;
  while (p && p.tagName.toLowerCase() !== "svg") {
    if (p.getAttribute("clip-path")) return true;
    p = p.parentElement;
  }
  return false;
}

describe.each(PORTRAITS)("$name stays inside its medallion", ({ Char }) => {
  it("has a square 64 viewBox and a medallion inscribed in it", () => {
    const { container } = render(<Char />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 64 64");
    // The backdrop circle every bust must be clipped to.
    const medallion = [...svg.querySelectorAll("circle")].find(
      (c) => c.getAttribute("cx") === "32" && c.getAttribute("cy") === "32" && c.getAttribute("r") === "31",
    );
    expect(medallion).toBeTruthy();
  });

  it("clips every shape that reaches the bottom of the viewBox", () => {
    // The actual defect, stated as a property. A path whose geometry touches
    // y=64 is by definition flush against the frame, so unless it is clipped
    // to the round medallion its bottom edge renders as a straight line.
    const { container } = render(<Char />);
    const svg = container.querySelector("svg")!;
    const floorReaching = [...svg.querySelectorAll("path")].filter((p) =>
      /\b64(?![\d.])/.test(p.getAttribute("d") ?? ""),
    );
    expect(floorReaching.length).toBeGreaterThan(0); // the bust exists
    for (const p of floorReaching) {
      expect(isClipped(p)).toBe(true);
    }
  });

  it("defines the clipPath it references", () => {
    // A clip-path pointing at a missing id silently does nothing — which would
    // look exactly like having no clip at all.
    const { container } = render(<Char />);
    const svg = container.querySelector("svg")!;
    for (const g of svg.querySelectorAll("[clip-path]")) {
      const id = (g.getAttribute("clip-path") ?? "").replace(/^url\(#|\)$/g, "");
      expect(id).not.toBe("");
      expect(svg.querySelector(`clipPath#${id}`)).toBeTruthy();
    }
  });
});

describe("the two portraits do not collide in the DOM", () => {
  it("uses different def ids, so both can be mounted at once", () => {
    // PersonaSwap renders BOTH branches (one hidden by CSS) so that the right
    // advisor paints on the first frame. Shared ids would make one portrait's
    // url(#…) resolve into the other's defs.
    const a = render(<PhilosopherKingCharacter />).container;
    const b = render(<ReferentCharacter />).container;
    const ids = (root: Element) => [...root.querySelectorAll("[id]")].map((e) => e.id);
    const overlap = ids(a).filter((id) => ids(b).includes(id));
    expect(overlap).toEqual([]);
  });
});
