// =========================================================================
// "מה אני יודע לעשות" — the advisor's teachable examples (note #14).
// =========================================================================
// Note #14: "אין היכרות עם המלך — לא דוגמאות, לא לימוד, לא הראה שהוא מבצע
// משימות". The chat surfaced QUESTION chips only, so the single most surprising
// capability — that the advisor turns a sentence into a real, confirmable change
// in the plan — was never taught to anyone.
//
// The honesty problem with "example prompts": an example that names a course the
// student doesn't have produces NO confirm card (detection runs against their
// REAL rows), and the advisor then talks about a card that never appears — the
// exact failure the constitution forbids. So we don't *hope* an example works:
// every example here is run through the real `detectActions` first, and only the
// ones that actually resolve to the intended verb are offered. When nothing
// verifies (an empty plan), the UI falls back to a placeholder line that names
// no course and promises no card.
//
// Pure + unit-tested; no React, no network.

import {
  detectActions,
  type AssistantAction,
  type CatalogCourseLite,
  type PlanCourseLite,
} from "@/lib/ai/action-router";

export interface AssistantExample {
  /** The exact sentence the chip puts in the input box. */
  prompt: string;
  /** The verb this sentence VERIFIABLY triggers (checked, not assumed). */
  action: AssistantAction["type"];
}

/** The grade used in the "I finished X" example. It is a PLACEHOLDER the
 *  student edits before sending — which is why these chips pre-fill the input
 *  instead of sending: the advisor must never file a number nobody typed. */
export const EXAMPLE_GRADE = 88;

/** How many catalog candidates we're willing to test for the ADD example. */
const CATALOG_SCAN_LIMIT = 40;

/** Some catalog rows carry an ENGLISH title in `nameHe` ("Topics in
 *  Macroeconomics"). Dropping a Latin phrase into a Hebrew example sentence
 *  reorders on screen and reads like a bug — live QA 13.8. Hebrew names only. */
const HAS_HEBREW = /[֐-׿]/;

/**
 * Build tappable action examples from the student's OWN plan + catalog.
 * Every returned prompt is verified to produce `action` through the same
 * detector the chat uses, so a tap can never advertise a card that won't render.
 */
export function buildActionExamples(
  plan: PlanCourseLite[],
  catalog: CatalogCourseLite[],
  isHe: boolean,
  limit = 3,
): AssistantExample[] {
  const out: AssistantExample[] = [];

  const verifyAndPush = (prompt: string, expected: AssistantAction["type"]): boolean => {
    if (out.length >= limit) return false;
    if (out.some((e) => e.prompt === prompt)) return false;
    const detected = detectActions(prompt, plan, catalog);
    // The FIRST proposal must be the one we advertise — a sentence that mostly
    // triggers something else is a confusing lesson, not a lesson.
    if (detected[0]?.type !== expected) return false;
    out.push({ prompt, action: expected });
    return true;
  };

  // Rows the student can still act on, in-progress first (the likeliest thing
  // they actually just finished).
  const rows = [
    ...plan.filter((r) => r.status === "IN_PROGRESS"),
    ...plan.filter((r) => r.status === "PLANNED"),
  ];

  // 1. The flagship verb: "I finished it, here's the grade".
  let completed: string | null = null;
  for (const r of rows) {
    if (
      verifyAndPush(
        isHe
          ? `סיימתי את ${r.nameHe} עם ציון ${EXAMPLE_GRADE}`
          : `I finished ${r.nameHe} with ${EXAMPLE_GRADE}`,
        "COMPLETE_COURSE",
      )
    ) {
      completed = r.nameHe;
      break;
    }
  }

  // 2. Add a course from the catalog — the verb that changes the plan.
  const addable = catalog.filter((c) => HAS_HEBREW.test(c.nameHe)).slice(0, CATALOG_SCAN_LIMIT);
  for (const c of addable) {
    if (
      verifyAndPush(
        isHe ? `תוסיף לי את ${c.nameHe}` : `Add ${c.nameHe} for me`,
        "ADD_COURSE",
      )
    ) {
      break;
    }
  }

  // 3. Move a row to another semester — proves it edits the plan, not just adds.
  // Prefer a DIFFERENT course than the "finished" example: three chips about the
  // same course teach one course, not three verbs.
  const moveRows = [...rows.filter((r) => r.nameHe !== completed), ...rows];
  for (const r of moveRows) {
    if (
      verifyAndPush(
        isHe ? `תעביר את ${r.nameHe} לסמסטר ב׳` : `Move ${r.nameHe} to semester B`,
        "MOVE_COURSE",
      )
    ) {
      break;
    }
  }

  return out;
}

/**
 * The teaching line shown when no example could be verified (an empty plan —
 * i.e. the brand-new student note #14 is actually about). It names NO course,
 * so it invents nothing, and it states the confirm-card contract explicitly.
 */
export function actionVerbsLine(isHe: boolean): string {
  return isHe
    ? `אפשר גם פשוט לספר לי מה קרה: "סיימתי את [שם הקורס] עם ציון ${EXAMPLE_GRADE}", "תוסיף לי את [שם הקורס]", "נכשלתי ב[שם הקורס]", "תעביר את [שם הקורס] לסמסטר ב׳". אני מקפיץ כרטיס-אישור — וכלום לא משתנה עד שתאשרו.`
    : `You can also just tell me what happened: "I finished [course] with ${EXAMPLE_GRADE}", "add [course] for me", "move [course] to semester B". I'll raise a confirm card — nothing changes until you approve it.`;
}
