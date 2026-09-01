import React from "react";
import { Img, staticFile } from "remotion";
import { C } from "../theme";

/**
 * צילום מסך אמיתי מהאתר החי, עם תנועת מצלמה מעליו.
 *
 * עיקרון Q1 של video-shotcraft: כשמשחזרים עמוד קיים — צילום אמיתי, לא UI
 * שנבנה ביד. הצילומים נלקחים ב-`npm run shoot` מ-pakam-strategist.vercel.app
 * דרך חשבון הדמו (קריאה־בלבד), ב-2x כדי שהטקסט יישאר חד גם בזום.
 *
 * ⚠️ Q2: הטקסטורה נשמרת בגודל המקורי (3840×2160) ומוקטנת בתצוגה. אסור
 * להקטין את הקובץ עצמו — טקסט מטושטש בזום מתחיל תמיד שם.
 */

/** גובה רצועת "מצב דמו" בראש הצילום (בפיקסלים של הפריים, לא של הטקסטורה). */
const DEMO_BANNER = 24;

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
  /** חיתוך רצועת הדמו — ברירת מחדל כן, זו כרומה ולא תוכן. */
  cropBanner?: boolean;
  radius?: number;
  shadow?: string;
}> = ({ src, focus, cropBanner = true, radius = 0, shadow }) => {
  const top = cropBanner ? -DEMO_BANNER : 0;
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
            top,
            left: 0,
            width: 1920,
            height: cropBanner ? 1080 + DEMO_BANNER : 1080,
            objectFit: "cover",
            objectPosition: "top center",
          }}
        />
      </div>
    </div>
  );
};
