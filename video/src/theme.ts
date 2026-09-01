/**
 * טוקני העיצוב של פכמון — הועתקו מ-`src/app/globals.css` (מצב בהיר).
 *
 * עיקרון 2 של video-shotcraft: השפה החזותית של הסרטון חייבת לצמוח מהמוצר
 * עצמו, ולא להיות "עור פרסומת" נפרד. לכן כל צבע, פונט ורדיוס כאן הוא הערך
 * האמיתי מהאפליקציה — לא גוון "בהשראת".
 */

import { JETBRAINS, RUBIK } from "./lib/fonts";

export const C = {
  // קנבס ודיו
  bg: "#FCFCFD",
  bgSecondary: "#F4F4F6",
  card: "#FFFFFF",
  ink: "#18181B",
  inkSecondary: "#52525B",
  muted: "#71717A",
  border: "#E8E8EC",
  borderSubtle: "#F1F1F4",

  // מותג — אינדיגו, הצבע הבטוח היחיד
  brand: "#5B5BD6",
  brandHover: "#4F4FC9",
  brandFg: "#FFFFFF",
  brandMuted: "rgba(91, 91, 214, 0.08)",
  brandRing: "rgba(91, 91, 214, 0.35)",

  // המלך הפילוסוף בלבד
  crownGold: "#c99a3b",
  crownGoldBright: "#f2c879",
  // רצועת המלך — המשטח הכהה היחיד המותר במוצר
  kingBand: "#22224a", // color-mix(in srgb, #5B5BD6 25%, #14142e) מחושב מראש

  // דיסציפלינות פכ"מ
  philosophy: "oklch(0.6 0.13 230)",
  economics: "oklch(0.68 0.16 152)",
  polsci: "oklch(0.63 0.2 27)",

  // סטטוס
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
} as const;

export const SHADOW = {
  card: "0 1px 2px rgba(16, 17, 26, 0.03), 0 6px 20px rgba(16, 17, 26, 0.05)",
  elevated: "0 2px 4px rgba(16, 17, 26, 0.04), 0 8px 24px rgba(16, 17, 26, 0.07)",
  float: "0 8px 16px rgba(16, 17, 26, 0.06), 0 24px 48px rgba(16, 17, 26, 0.10)",
} as const;

export const FONT = {
  // Rubik לכל טקסט; JetBrains Mono רק למספרים וקודי קורס.
  // הערכים מגיעים מ-@remotion/google-fonts כדי שהרנדר לא ייפול ל-fallback.
  body: `${RUBIK}, system-ui, -apple-system, "Segoe UI", sans-serif`,
  mono: `${JETBRAINS}, "Fira Code", monospace`,
} as const;

/** עברית: letter-spacing תמיד 0. אף פעם לא tracking ידני על עברית. */
export const HE: React.CSSProperties = {
  fontFamily: FONT.body,
  letterSpacing: 0,
  direction: "rtl",
};

/** מספרים: מונו + tabular + LTR, אבל רק על המספר עצמו (bdi). */
export const NUM: React.CSSProperties = {
  fontFamily: FONT.mono,
  fontVariantNumeric: "tabular-nums",
  direction: "ltr",
  unicodeBidi: "isolate",
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;
