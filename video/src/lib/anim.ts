import { interpolate, Easing } from "remotion";

/**
 * עקומות ההאטה של פכמון — הערכים מ-`globals.css`, לא המצאה.
 * ease-out-soft הוא ברירת המחדל לכל דבר נראה.
 */
export const EASE = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  outSoft: Easing.bezier(0.16, 1, 0.3, 1),
  outQuint: Easing.bezier(0.22, 1, 0.36, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
  in: Easing.bezier(0.4, 0, 1, 1),
} as const;

type Opts = { easing?: (t: number) => number };

/** אינטרפולציה עם clamp דו־צדדי — ברירת המחדל שאנחנו רוצים כמעט תמיד. */
export const ramp = (
  frame: number,
  [inF, outF]: [number, number],
  [from, to]: [number, number],
  opts: Opts = {},
) =>
  interpolate(frame, [inF, outF], [from, to], {
    easing: opts.easing ?? EASE.outSoft,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** כניסה סטנדרטית: fade + הרמה קלה. אנימציית הכניסה היחידה של המוצר. */
export const enter = (frame: number, start: number, dur = 12) => ({
  opacity: ramp(frame, [start, start + dur], [0, 1]),
  transform: `translateY(${ramp(frame, [start, start + dur], [10, 0])}px)`,
});

/** stagger בקצב 50ms (מדרגה = 1.5 פריימים ב-30fps, מעוגל ל-2). */
export const stagger = (i: number, step = 2) => i * step;

/**
 * כלל R1 של הסקיל: אחרי שמידע קריטי נוחת — חייבים לנשום.
 * מחזיר true בזמן שהמסך צריך להישאר דומם.
 */
export const isHolding = (frame: number, from: number, to: number) =>
  frame >= from && frame < to;
