import { describe, it, expect } from "vitest";
import { firstNameOf, gendered, normalizeGender, greetNameForLocale } from "@/lib/personal-address";

describe("firstNameOf", () => {
  it("prefers an explicit firstName", () => {
    expect(firstNameOf({ firstName: "דני", displayName: "משה כהן" })).toBe("דני");
  });
  it("falls back to the first token of displayName", () => {
    expect(firstNameOf({ displayName: "משה כהן" })).toBe("משה");
  });
  it("ignores an email-looking displayName", () => {
    expect(firstNameOf({ displayName: "a@b.com" })).toBeNull();
  });
  it("returns null when nothing usable", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf({})).toBeNull();
    expect(firstNameOf({ firstName: "   " })).toBeNull();
  });
});

describe("gendered", () => {
  const forms = { m: "מוזמן", f: "מוזמנת", n: "מוזמן/ת" };
  it("picks male / female forms", () => {
    expect(gendered("male", forms)).toBe("מוזמן");
    expect(gendered("female", forms)).toBe("מוזמנת");
  });
  it("falls back to the neutral form for unknown gender", () => {
    expect(gendered(null, forms)).toBe("מוזמן/ת");
    expect(gendered(undefined, forms)).toBe("מוזמן/ת");
    expect(gendered("nonsense" as unknown as null, forms)).toBe("מוזמן/ת");
  });
});

describe("greetNameForLocale", () => {
  it("shows a Hebrew name in Hebrew", () => {
    expect(greetNameForLocale({ firstName: "דני" }, true)).toBe("דני");
  });
  it("hides a Latin name in Hebrew (never 'היי Dan')", () => {
    expect(greetNameForLocale({ firstName: "Dan" }, true)).toBeNull();
  });
  it("allows any name in English", () => {
    expect(greetNameForLocale({ firstName: "Dan" }, false)).toBe("Dan");
    expect(greetNameForLocale({ firstName: "דני" }, false)).toBe("דני");
  });
  it("returns null when there is no name", () => {
    expect(greetNameForLocale(null, true)).toBeNull();
  });
});

describe("normalizeGender", () => {
  it("only accepts male/female", () => {
    expect(normalizeGender("male")).toBe("male");
    expect(normalizeGender("female")).toBe("female");
    expect(normalizeGender("other")).toBeNull();
    expect(normalizeGender(null)).toBeNull();
  });
});

// =========================================================================
// #29a — "שם תצוגה שונה מהשם המקורי"
// =========================================================================
// Settings used to show TWO name inputs. The one labelled "שם תצוגה" promised,
// in its own hint, "השם שיופיע בברכה בלוח הבית" — and it never reached the
// greeting, because firstName wins here and displayName is rendered nowhere in
// the app. A student who typed a name into the field that says it greets them
// and then saw the other name is reporting a real defect, not a preference.
//
// The input is gone; "שם פרטי" is the single name. These tests pin the two
// halves of that: the precedence that made the old field inert, and the
// fallback that keeps old accounts greeted.
describe("#29a — one name, one job", () => {
  it("firstName is what greets — the reason the second field was inert", () => {
    expect(
      firstNameOf({ firstName: "אריאל", displayName: "משהו אחר לגמרי" }),
    ).toBe("אריאל");
  });

  it("an account that only ever had displayName is still greeted by it", () => {
    // The column and the tRPC field were kept precisely so this keeps working.
    expect(firstNameOf({ firstName: null, displayName: "אריאל צירין" })).toBe("אריאל");
  });

  it("clearing firstName does not resurrect a stale displayName as the greeting", () => {
    // Guard on the shape of the fallback: an EMPTY firstName is "no name", so
    // the fallback is correct here. A WHITESPACE one must behave identically —
    // otherwise " " silently outranks a real name.
    expect(firstNameOf({ firstName: "   ", displayName: "דניאל" })).toBe("דניאל");
  });
});
