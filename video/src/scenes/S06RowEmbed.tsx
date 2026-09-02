import React from "react";
import { useCurrentFrame } from "remotion";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { PageShot } from "../ui/PageShot";

/**
 * ס׳6 · 60f · מערכת השעות
 * כרטיס: row-embed — התוכן נוחת ונכנס לעמוד.
 *
 * צילום אמיתי של /he/calendar. שפת ה-rotateX של הכרטיס מופעלת על העמוד
 * כולו: הרשת מגיעה מוטה ומתיישרת, במקום שורות שנבנו ביד.
 */

export const S06RowEmbed: React.FC = () => {
  const frame = useCurrentFrame();
  const p = ramp(frame, [0, 40], [0, 1], { easing: EASE.outQuint });
  const tilt = (1 - p) * 26;
  const lift = (1 - p) * -60;

  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `perspective(2200px) rotateX(${tilt}deg) translateY(${lift}px)`,
          transformOrigin: "bottom center",
        }}
      >
        <PageShot src="calendar.png" focus={{ x: 46, y: 56, scale: 1.25 }} />
      </div>
      <Caption text="מערכת שבועית שנבנית לבד" at={42} />
    </Stage>
  );
};
