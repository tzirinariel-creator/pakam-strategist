// The cohort game layer (#social-gamified) — contribution levels. Pure math,
// zero DB: feed it the counts. Titles climb from seedling to legend; the next
// threshold powers a progress bar so contributing always has a visible "why".

export interface ContributorLevel {
  /** 0-based level index. */
  level: number;
  titleHe: string;
  titleEn: string;
  /** Contributions needed for the NEXT level, or null at the top. */
  nextAt: number | null;
  /** 0..1 progress toward the next level (1 at the top). */
  progress: number;
}

// Product copy carries no decorative emoji (the rank badges used to render
// 👀/🌱/🌿/🌳/👑 next to the title). The rank NAME is the signal.
const LEVELS = [
  { at: 0, he: "צפייה מהצד", en: "Observer" },
  { at: 1, he: "ניצן המחזור", en: "Cohort seedling" },
  { at: 3, he: "תרומה פעילה", en: "Active contributor" },
  { at: 6, he: "עמוד תווך", en: "Pillar" },
  { at: 10, he: "אגדת המחזור", en: "Cohort legend" },
] as const;

export function contributorLevel(total: number): ContributorLevel {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i]!.at) idx = i;
  }
  const cur = LEVELS[idx]!;
  const next = LEVELS[idx + 1] ?? null;
  const progress = next
    ? Math.min(1, (total - cur.at) / (next.at - cur.at))
    : 1;
  return {
    level: idx,
    titleHe: cur.he,
    titleEn: cur.en,
    nextAt: next?.at ?? null,
    progress,
  };
}
