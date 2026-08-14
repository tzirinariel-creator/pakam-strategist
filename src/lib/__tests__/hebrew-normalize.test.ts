// =========================================================================
// One Hebrew fold for intent matching — and the ones that are NOT duplicates
// =========================================================================
import { describe, it, expect } from "vitest";
import { normalizeHebrewForMatch } from "@/lib/hebrew-normalize";
import { normalizeName } from "@/lib/grade-sheet";
import { normalizeHebrewPunct } from "@/lib/hebrew-punct";

describe("normalizeHebrewForMatch", () => {
  it("folds gershayim so ש״ס / שס / ש\"ס all match", () => {
    const forms = ["ש״ס", "שס", 'ש"ס', "ש׳ס"];
    const folded = forms.map(normalizeHebrewForMatch);
    expect(new Set(folded).size).toBe(1);
    expect(folded[0]).toBe("שס");
  });

  it("folds final letters, so a folded pattern matches either spelling", () => {
    expect(normalizeHebrewForMatch("תוסיף")).toBe("תוסיפ");
    expect(normalizeHebrewForMatch("סיכום")).toBe("סיכומ");
    expect(normalizeHebrewForMatch("כן")).toBe("כנ");
  });

  it("turns the maqaf and other punctuation into a space", () => {
    expect(normalizeHebrewForMatch("עובר/לא-עובר")).toBe("עובר לא עובר");
    expect(normalizeHebrewForMatch("תחום־מיקוד")).toBe("תחומ מיקוד");
  });

  it("strips niqqud and collapses whitespace", () => {
    expect(normalizeHebrewForMatch("  שָׁלוֹם   עולם  ")).toBe("שלומ עולמ");
  });

  it("lowercases Latin text too", () => {
    expect(normalizeHebrewForMatch("What ARE my credits?")).toBe("what are my credits");
  });
});

describe("the other normalizers are deliberately NOT merged into it", () => {
  it("grade-sheet.normalizeName keeps final letters — course names would collide", () => {
    // Folding ם→מ here would make two different catalog names look identical.
    expect(normalizeName("יחסים בינלאומיים")).toContain("ם");
    expect(normalizeHebrewForMatch("יחסים בינלאומיים")).not.toContain("ם");
  });

  it("grade-sheet.normalizeName turns quotes into a SPACE, the match fold deletes them", () => {
    expect(normalizeName('פכ"מ')).toBe("פכ מ");
    expect(normalizeHebrewForMatch('פכ"מ')).toBe("פכמ");
  });

  it("hebrew-punct.normalizeHebrewPunct is the INVERSE — it adds gershayim", () => {
    expect(normalizeHebrewPunct('ש"ס')).toBe("ש״ס");
    // …which is exactly what the match fold then removes again.
    expect(normalizeHebrewForMatch(normalizeHebrewPunct('ש"ס'))).toBe("שס");
  });
});
