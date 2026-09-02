import React from "react";
import { Img, staticFile } from "remotion";
import { C } from "../theme";

/**
 * צילום מסך אמיתי, עם תנועת מצלמה מעליו.
 *
 * עיקרון Q1 של video-shotcraft: כשמשחזרים עמוד קיים — צילום אמיתי, לא UI
 * שנבנה ביד. `npm run shoot` מצלם ב-2x מהשרת המקומי (או מהפרודקשן עם
 * SHOOT_BASE), דרך חשבון הדמו בקריאה־בלבד.
 *
 * ⚠️ Q2: הטקסטורה נשמרת ב-3840×2160 ומוקטנת בתצוגה. אסור להקטין את הקובץ
 * עצמו — טקסט מטושטש בזום מתחיל תמיד שם.
 *
 * ⚠️ הצילום הוא 1920×1080 מדויק, ולכן `width`/`height` מפורשים ולא
 * `objectFit: cover`. עם cover, כל סטייה ביחס הגובה־רוחב של המכולה גורמת
 * לחיתוך אופקי — וזה מה שהעלים את הסיידבר בגרסה קודמת. רצועת "מצב דמו"
 * מוסתרת בצד הצילום, לא בקיזוז כאן.
 */

export type Focus = {
  /** מרכז המסגרת ב-% מרוחב/גובה העמוד. 50/50 = מרכז. */
  x: number;
  y: number;
  /** 1 = הפריים המלא. 3 = פי־שלושה זום. */
  scale: number;
};

export const PageShot: React.FC<{
  src: string;
  focus: Focus;
  radius?: number;
  shadow?: string;
}> = ({ src, focus, radius = 0, shadow }) => {
  // הזזה כך שנקודת המיקוד תשב במרכז הפריים.
  const tx = (50 - focus.x) * (1920 / 100) * focus.scale;
  const ty = (50 - focus.y) * (1080 / 100) * focus.scale;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: C.bg,
        borderRadius: radius,
        boxShadow: shadow,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${tx}px, ${ty}px) scale(${focus.scale})`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={staticFile(`shots/${src}`)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1920,
            height: 1080,
            display: "block",
          }}
        />
      </div>
    </div>
  );
};
