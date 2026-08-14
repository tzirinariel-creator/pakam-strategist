// The "1 קורסים" family — see src/lib/he-count.ts for why this exists.
import { describe, it, expect } from "vitest";
import { heCount, heNoun, heNounF, heList, enList } from "@/lib/he-count";

describe("heNoun / heNounF", () => {
  it("spells the number as a word at one, and keeps the noun singular", () => {
    expect(heNoun(1, "קורס", "קורסים")).toBe("קורס אחד");
    expect(heNounF(1, "שורה", "שורות")).toBe("שורה אחת");
  });

  it("uses the digit and the plural above one", () => {
    expect(heNoun(3, "קורס", "קורסים")).toBe("3 קורסים");
    expect(heNounF(12, "שורה", "שורות")).toBe("12 שורות");
  });

  it("zero takes the plural — '0 קורסים' is correct Hebrew", () => {
    expect(heNoun(0, "קורס", "קורסים")).toBe("0 קורסים");
  });

  it("never emits the shape that started this: a bare 1 before a plural", () => {
    for (const n of [0, 1, 2, 5, 11]) {
      expect(heNoun(n, "קורס", "קורסים")).not.toMatch(/^1 קורסים/);
      expect(heNounF(n, "שורה", "שורות")).not.toMatch(/^1 שורות/);
    }
  });
});

describe("heCount", () => {
  it("lets the caller phrase the singular as its own sentence", () => {
    // The verb changes too, which is why both forms are required at the call
    // site instead of being derived.
    const say = (n: number) =>
      heCount(n, { one: "קורס אחד לא נספר", many: `${n} קורסים לא נספרו` });
    expect(say(1)).toBe("קורס אחד לא נספר");
    expect(say(4)).toBe("4 קורסים לא נספרו");
  });
});

describe("heList", () => {
  it("joins with commas and one final ו", () => {
    expect(heList(["ראשון", "שני", "חמישי"])).toBe("ראשון, שני וחמישי");
  });

  it("two items take only the ו", () => {
    expect(heList(["ראשון", "שני"])).toBe("ראשון ושני");
  });

  it("one item is itself; none is empty", () => {
    expect(heList(["ראשון"])).toBe("ראשון");
    expect(heList([])).toBe("");
  });

  it("never produces the chain-of-vavs the planner shipped", () => {
    expect(heList(["ראשון", "שני", "חמישי"])).not.toBe("ראשון ושני וחמישי");
    expect(heList(["א", "ב", "ג", "ד"])).not.toMatch(/ו\S+ ו/);
  });
});

describe("enList", () => {
  it("mirrors heList in English", () => {
    expect(enList(["Sun", "Mon", "Thu"])).toBe("Sun, Mon and Thu");
    expect(enList(["Sun", "Mon"])).toBe("Sun and Mon");
    expect(enList(["Sun"])).toBe("Sun");
    expect(enList([])).toBe("");
  });
});
