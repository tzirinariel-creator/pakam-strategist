// =========================================
// One colour per course — everywhere
// =========================================
// Measured on TauPlan (docs/מחקר-מתחרים-מערכת-שעות.md §1): the single biggest
// reason their screen reads as tidy is that a course keeps ONE colour across
// the grid block, the sidebar card and the exam strip. Ours varied by surface,
// because every surface derived its colour from the DISCIPLINE — and the
// discipline itself is not stable per course: `UserCourse.disciplineOverride`
// lets a student re-file a course, so the same course could legitimately draw
// in two different colours on two screens of the same session.
//
// So the colour is derived from the COURSE CODE and nothing else:
//   • stable across renders, sessions, devices and users (pure hash, no state)
//   • immune to a discipline override
//   • identical on every surface that asks for it
//
// This resolves N4 in the competitor study ("זהות צבע אחת לקורס") in favour of
// colour-per-course. The discipline reading the grid used to carry now lives
// where it is actually legible — the DisciplineBadge on the cards, the pool
// filter and the insights bar — none of which this file touches.
//
// ── Why CSS variables and not hex ────────────────────────────────────
// A single hex cannot serve both themes: a colour dark enough to sit on the
// white card (#FFFFFF) is too dark to be seen on the dark card (#16161C), and
// vice versa. `courseColor()` therefore returns `var(--course-color-N)`, and
// globals.css declares the same N twice — a Tailwind-600-weight value under
// `:root` (light) and a Tailwind-400-weight value under `.dark`. Both bands
// clear 3:1 contrast against their own card background, so the dot/border a
// student actually sees is never the washed-out one. No JS theme detection,
// no flash on first paint, no per-surface divergence.
//
// COURSE_COLOR_COUNT is asserted against globals.css in the test file — if the
// two ever drift, a course index would resolve to an undefined variable and
// paint transparent, which is exactly the kind of silent failure that would
// only show up in production.

/** Number of colours in the ramp. Must match the `--course-color-*` set in globals.css. */
export const COURSE_COLOR_COUNT = 12;

/**
 * Normalize a course key so every spelling of the same code lands on the same
 * colour. The ידיעון, the scraper and the UI all write course codes slightly
 * differently ("0651-1010", "0651 1010", "06511010"), and a student typing one
 * form must not get a different colour from the catalog's form.
 */
export function normalizeCourseKey(key: string): string {
  const stripped = key.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A custom course may carry a Hebrew-only name and no code at all. Falling
  // back to the trimmed original keeps it deterministic instead of collapsing
  // every such course onto index 0.
  return stripped.length > 0 ? stripped : key.trim();
}

/**
 * FNV-1a (32-bit). Chosen over `hashCode`-style `h*31+c` because that variant
 * clusters badly on strings that share a long prefix — which is exactly what
 * TAU course codes are ("0651-1010", "0651-1011", "0651-2020" …). FNV spreads
 * them; a shift-and-add hash would hand a whole department one colour.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash * 16777619, kept inside 32 bits without overflowing the float
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic ramp index for a course. Same input → same index, forever.
 * Returns 0 for an empty key rather than throwing: a missing code must degrade
 * to a valid colour, never to `undefined` (which paints transparent).
 */
export function courseColorIndex(courseKey: string | null | undefined): number {
  if (!courseKey) return 0;
  const normalized = normalizeCourseKey(courseKey);
  if (normalized.length === 0) return 0;
  return fnv1a(normalized) % COURSE_COLOR_COUNT;
}

/**
 * The course's colour, as a CSS value. Theme-aware by construction — see the
 * header note. Safe anywhere a colour is expected: `backgroundColor`,
 * `borderColor`, and inside `color-mix()`.
 */
export function courseColor(courseKey: string | null | undefined): string {
  return `var(--course-color-${courseColorIndex(courseKey)})`;
}

/**
 * The LIGHT ramp as literal hex, for canvas.
 *
 * `courseColor()` returns `var(--course-color-N)`, which is right for the DOM
 * and useless to a `<canvas>`: `ctx.fillStyle = "var(--course-color-3)"` does
 * not throw, it is silently ignored and the previous fill is reused. The first
 * shared timetable image came out with every block painted the same grey, and
 * nothing in the type system or the tests said a word — the header note above
 * warns about exactly this trap for `color-mix()` and it caught me anyway.
 *
 * Light weights specifically, because the shared image is drawn in one fixed
 * palette on a white card rather than following the sender's theme: an image
 * forwarded into someone else's chat has no theme to follow, and a dark-mode
 * card landing in a light chat is how a shared picture ends up looking broken.
 *
 * Pinned against globals.css by course-color.test.ts, which is what keeps this
 * from drifting into a second source of truth.
 */
export const COURSE_COLOR_HEX_LIGHT = [
  "#2563EB", "#D97706", "#059669", "#C026D3", "#0891B2", "#E11D48",
  "#7C3AED", "#65A30D", "#EA580C", "#0D9488", "#4F46E5", "#DB2777",
] as const;

/** The course's colour as a hex literal — for canvas and anything else that
 *  cannot resolve a CSS variable. Prefer `courseColor()` in the DOM. */
export function courseColorHex(courseKey: string | null | undefined): string {
  return COURSE_COLOR_HEX_LIGHT[courseColorIndex(courseKey)] ?? COURSE_COLOR_HEX_LIGHT[0];
}

/**
 * A tinted SURFACE in the course's colour — the grid block's fill and the plan
 * card's wash. `percent` is how much of the course colour survives; the rest is
 * `base`, which defaults to the card so the tint tracks the theme.
 *
 * Kept low on purpose (the grid uses 14%): the block's text is plain
 * `--foreground`, so the fill must stay close enough to the card that the text
 * contrast is the card's contrast. A saturated fill is what turned the old grid
 * into the "busy and broken" screen the redesign removed.
 */
export function courseSurface(
  courseKey: string | null | undefined,
  percent: number,
  base = "var(--card)"
): string {
  return `color-mix(in srgb, ${courseColor(courseKey)} ${percent}%, ${base})`;
}

/**
 * A hairline EDGE in the course's colour — the grid block's border. Fades to
 * transparent rather than to the card so it works over the today-column tint
 * and over an overlapping block without banding.
 */
export function courseEdge(
  courseKey: string | null | undefined,
  percent: number
): string {
  return `color-mix(in srgb, ${courseColor(courseKey)} ${percent}%, transparent)`;
}
