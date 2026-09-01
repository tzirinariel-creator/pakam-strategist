import { loadFont as loadRubik } from "@remotion/google-fonts/Rubik";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

/**
 * הפונטים של פכמון — Rubik לכל טקסט, JetBrains Mono למספרים בלבד.
 *
 * בלי טעינה מפורשת, הרנדר נופל ל-system-ui ולמונוספייס של המערכת, והסרטון
 * מפסיק להיראות כמו המוצר. `waitUntilDone()` מבטיח שהרנדר לא מתחיל לפני
 * שהגופנים זמינים — אחרת פריימים ראשונים ייצאו בגופן שגוי.
 */
const rubik = loadRubik();
const jetbrains = loadJetBrains();

export const RUBIK = rubik.fontFamily;
export const JETBRAINS = jetbrains.fontFamily;

export const fontsReady = Promise.all([
  rubik.waitUntilDone(),
  jetbrains.waitUntilDone(),
]);
