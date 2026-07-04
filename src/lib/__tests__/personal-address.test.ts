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
