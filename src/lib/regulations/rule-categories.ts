// =========================================
// Rule categories — DISPLAY-ONLY thematic grouping
// =========================================
// Groups the ~25 flat compliance rules into a handful of human themes so the
// regulations tab reads like "my situation by area" instead of a flat database
// of rule codes. Pure presentation: the rule ENGINE (rules.ts / rule-engine.ts)
// is untouched — this only decides which accordion a passed/in-progress rule
// falls under. Blocking gates are surfaced separately (RedFlags), never here.

export type RuleGroup = "credits" | "grades" | "english" | "seminars" | "miluim";

/** Which theme a rule belongs to. Unknown ids fall back to "credits" (the
 *  degree-composition catch-all), so a new rule is never dropped from the UI. */
export function ruleGroup(ruleId: string): RuleGroup {
  if (ruleId.startsWith("DISC-")) return "credits";
  switch (ruleId) {
    // Grades, averages, and the gates that can END a degree.
    case "PKM-013": // graduation score
    case "PKM-014": // fail-rate cap
    case "PKM-015": // max attempts
    case "PKM-016": // year 1→2 overall-average gate
    case "PKM-017": // year 1→2 PPE-core gate
    case "PKM-023": // second failure in the same course
      return "grades";
    // English content + level + exemption deadline.
    case "PKM-012":
    case "PKM-021":
    case "PKM-022":
      return "english";
    // Seminars + referat.
    case "PKM-008":
    case "PKM-009":
    case "PKM-019":
      return "seminars";
    // Miluim (reserve-duty) benefits + caps.
    case "PKM-024":
    case "PKM-025":
      return "miluim";
    // Everything else = degree composition (total / mandatory / elective /
    // focus-area / law-foundation / all-mandatory-done).
    default:
      return "credits";
  }
}

export const RULE_GROUP_ORDER: RuleGroup[] = ["credits", "grades", "seminars", "english", "miluim"];

export const RULE_GROUP_META: Record<RuleGroup, { he: string; en: string }> = {
  credits: { he: "הרכב התואר", en: "Degree composition" },
  grades: { he: "ציונים ושערי-מעבר", en: "Grades & progression gates" },
  seminars: { he: "סמינרים ורפרט", en: "Seminars & referat" },
  english: { he: "אנגלית", en: "English" },
  miluim: { he: "מילואים", en: "Reserve duty" },
};
