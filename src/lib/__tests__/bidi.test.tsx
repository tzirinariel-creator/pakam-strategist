// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Bidi } from "@/lib/bidi";

// Regression for the 24.7 audit: "קבוצה C — 35 ימים ומעלה" rendered visually
// scrambled. Root cause was NOT the em dash alone — "C" and "35" each became
// their own isolated <bdi>, with the bare " — " sitting unprotected between
// two isolates in the RTL paragraph (classic two-isolates-plus-neutral bug).
// The fix joins a dash-connected run (with a single space on either side)
// into ONE isolate, matching how "21-34" already worked without spaces.
describe("Bidi — em/en dash runs with surrounding spaces (24.7 fix)", () => {
  it("joins an em-dash-connected run into a single isolate", () => {
    const { container } = render(<Bidi text="קבוצה C — 35 ימים ומעלה בסמסטר" />);
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("C — 35");
  });

  it("still joins the existing no-space en-dash range (no regression)", () => {
    const { container } = render(<Bidi text="שירות 21-34 ימים" />);
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("21-34");
  });

  it("still isolates a plain number with no dash at all", () => {
    const { container } = render(<Bidi text="נשארו 5 ימים" />);
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("5");
  });

  it("does not merge across a Hebrew word between two separate numbers", () => {
    const { container } = render(<Bidi text="מ-21 ועד 34 ימים" />);
    const isolates = container.querySelectorAll("bdi");
    // "21" and "34" are separated by Hebrew ("ועד"), not by a bare connector —
    // must stay two distinct isolates, not merge into one.
    expect(isolates.length).toBeGreaterThanOrEqual(2);
  });
});

// #35 — the miluim credit-exemption block. The per-year line used an ARROW
// ("תשפ״ד: קבוצה C → 8 ש״ס"): the arrow is a bidi-neutral sitting between two
// separate isolates, so the line reordered on screen — exactly Ariel's
// "עברית שבורה". The line now uses an em dash, which <Bidi> folds into ONE
// isolate with the group letter and the number.
describe("Bidi — the miluim per-year exemption line (#35)", () => {
  it("keeps 'קבוצה C — 8' in a single isolate", () => {
    const { container } = render(<Bidi text="תשפ״ד: קבוצה C — 8 ש״ס" />);
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("C — 8");
    // The Hebrew around it is untouched — no dir on Hebrew text (CLAUDE.md).
    expect(container.textContent).toBe("תשפ״ד: קבוצה C — 8 ש״ס");
    expect(container.querySelector('[dir="ltr"]:not(bdi)')).toBeNull();
  });

  it("the ARROW form is exactly the broken case: two isolates with a bare neutral between them", () => {
    const { container } = render(<Bidi text="תשפ״ד: קבוצה C → 8 ש״ס" />);
    // Documents WHY the arrow was replaced — "→" is not a joinable connector.
    expect(container.querySelectorAll("bdi")).toHaveLength(2);
  });

  it("isolates the accrued-credits headline ('10 ש״ס נצברו לכם עד היום')", () => {
    const { container } = render(<Bidi text="10 ש״ס נצברו לכם עד היום" />);
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("10");
    // The space between the number and the Hebrew survives (the "10ש״ס" bug).
    expect(container.textContent).toBe("10 ש״ס נצברו לכם עד היום");
  });
});
