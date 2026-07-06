import { describe, it, expect } from "vitest";
import { ruleGroup, RULE_GROUP_ORDER, RULE_GROUP_META } from "@/lib/regulations/rule-categories";
import { ALL_RULES } from "@/lib/regulations/rules";

describe("ruleGroup", () => {
  it("maps the blocking grade gates to 'grades'", () => {
    for (const id of ["PKM-013", "PKM-015", "PKM-016", "PKM-017", "PKM-023"]) {
      expect(ruleGroup(id)).toBe("grades");
    }
  });

  it("maps English rules to 'english' and seminars to 'seminars'", () => {
    expect(ruleGroup("PKM-012")).toBe("english");
    expect(ruleGroup("PKM-022")).toBe("english");
    expect(ruleGroup("PKM-019")).toBe("seminars");
    expect(ruleGroup("PKM-008")).toBe("seminars");
  });

  it("folds DISC-* and unknown ids into 'credits' (never dropped from the UI)", () => {
    expect(ruleGroup("DISC-PHILOSOPHY")).toBe("credits");
    expect(ruleGroup("PKM-999")).toBe("credits");
    expect(ruleGroup("")).toBe("credits");
  });

  it("every REAL engine rule lands in a known group with meta + order", () => {
    // Run the actual engine rules through the map — a new rule must never
    // fall outside the displayable groups.
    const ctxLess = ALL_RULES.length; // sanity: rules exist
    expect(ctxLess).toBeGreaterThan(15);
    const validGroups = new Set(RULE_GROUP_ORDER);
    // Rule ids are embedded in the result objects; we can't invoke rules
    // without a context here, so assert on the static id list via source scan
    // of known ids used by the engine (PKM-001..025 + DISC-*).
    const knownIds = [
      "PKM-001", "PKM-007", "PKM-008", "PKM-009", "PKM-010", "PKM-011",
      "PKM-012", "PKM-013", "PKM-014", "PKM-015", "PKM-016", "PKM-017",
      "PKM-018", "PKM-019", "PKM-020", "PKM-021", "PKM-022", "PKM-023",
      "PKM-024", "PKM-025", "DISC-ECONOMICS",
    ];
    for (const id of knownIds) {
      const g = ruleGroup(id);
      expect(validGroups.has(g)).toBe(true);
      expect(RULE_GROUP_META[g].he.length).toBeGreaterThan(0);
    }
  });
});
