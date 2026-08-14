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

// Text sweep 13.8: a numeric RANGE inside Hebrew ("(50–150)", "21–34 ימים")
// reorders to "150–50" unless the whole run is isolated. These strings are now
// rendered through <Bidi> (settings/profile-section.tsx, onboarding/
// step-profile.tsx), so lock the folding behaviour they depend on.
describe("Bidi — numeric ranges inside Hebrew (text sweep 13.8)", () => {
  it("folds an en-dash range in parentheses into ONE isolate", () => {
    const { container } = render(
      <Bidi text="ציון מיון האנגלית (50–150). קובע אילו קורסי אנגלית נדרשים מכם." />
    );
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("50–150");
    expect(container.textContent).toBe(
      "ציון מיון האנגלית (50–150). קובע אילו קורסי אנגלית נדרשים מכם."
    );
  });

  it("folds each range of the miluim group blurb separately, never splitting one", () => {
    const { container } = render(
      <Bidi text="שירות של 21–34 ימים בסמסטר. נכללים גם: לוחמים עם 14–20 ימים, 35+ ימים בשנה." />
    );
    const isolates = [...container.querySelectorAll("bdi")].map((b) => b.textContent);
    expect(isolates).toEqual(["21–34", "14–20", "35+"]);
  });

  it("keeps an ordinal like '1.' whole (the numbered onboarding steps)", () => {
    const { container } = render(<Bidi text="1. ספרו מי אתם" />);
    const isolates = container.querySelectorAll("bdi");
    expect(isolates).toHaveLength(1);
    expect(isolates[0]!.textContent).toBe("1");
    // The period MUST stay outside the isolate. An earlier version of this test
    // claimed the opposite and blessed `<bdi dir="ltr">{i + 1}.</bdi>` — that
    // markup renders ". 1 label" in a real RTL context, because the isolate
    // becomes one LTR box placed at the line start with the dot on its right
    // edge. jsdom has no bidi layout, so textContent can never catch it; the
    // regression guard is the assertion below, which pins the DOM shape that
    // browser geometry proved correct.
    expect(container.textContent).toBe("1. ספרו מי אתם");
    expect(isolates[0]!.textContent).not.toContain(".");
  });
});

// ── 14.8: "מינוס אחרי התאריך" — a Hebrew prefix hyphen was eaten ──────────
// LTR_RUN's optional leading sign exists for "+10%" / "-5". But Hebrew glues
// its one-letter prepositions on with a hyphen (ב-10.7.26, ל-31.12, מ-21), and
// there the hyphen belongs to the WORD. It was being pulled into the isolate,
// so it rendered on the isolate's left edge — i.e. AFTER the date in reading
// order. Ariel saw "הסתיימו ב 10.7.26-" on the onboarding screen.
describe("a Hebrew prefix hyphen stays out of the isolate (14.8)", () => {
  const isolates = (text: string) => {
    const { container } = render(<Bidi text={text} />);
    return [...container.querySelectorAll("bdi")].map((b) => b.textContent);
  };

  it("keeps ב- attached to the word, not the number", () => {
    expect(isolates("הלימודים הסתיימו ב-10.7.26.")).toEqual(["10.7.26"]);
  });

  it("covers the other one-letter prefixes Hebrew glues on", () => {
    expect(isolates("מגישים עד ל-31.12.26")).toEqual(["31.12.26"]);
    expect(isolates("החל מ-21 ימים")).toEqual(["21"]);
    expect(isolates("פילוסופיה של המאה ה-19")).toEqual(["19"]);
  });

  it("STILL isolates a real negative number when no Hebrew precedes it", () => {
    // The guard must not break the case the leading sign was added for.
    expect(isolates("הפרש: -5 ש״ס")).toEqual(["-5"]);
    expect(isolates("+10% לקבוצה C")).toEqual(["+10%", "C"]);
  });

  it("leaves the whole sentence readable — both dates, both prefixes", () => {
    const { container } = render(
      <Bidi text="הלימודים הסתיימו ב-10.7.26, והמבחנים החלו ב-12.7.26." />,
    );
    expect([...container.querySelectorAll("bdi")].map((b) => b.textContent)).toEqual([
      "10.7.26",
      "12.7.26",
    ]);
    // Nothing may be lost or duplicated by the rewrite.
    expect(container.textContent).toBe(
      "הלימודים הסתיימו ב-10.7.26, והמבחנים החלו ב-12.7.26.",
    );
  });
});
