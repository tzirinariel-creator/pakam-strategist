import React from "react";
import { useCurrentFrame } from "remotion";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { PageShot } from "../ui/PageShot";

/**
 * ס׳7 · 132f · מחשבון ציון הגמר — ביט הכנות
 * כרטיס: hatch-depth — "מטיוטה לנתון אמיתי".
 *
 * צילום אמיתי של /he/graduation. המסך נחשף מבעד לשכבת קווקו שמתפוגגת —
 * בדיוק השפה של פכמון: "קו מקווקו = כאן יהיה משהו, קו מלא = זה קיים."
 *
 * המשקולות אמיתיות: 78% קורסים · 18% סמינריונים · 4% רפרט.
 */

export const S07HatchDepth: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = ramp(frame, [10, 74], [0, 1], { easing: EASE.outSoft });
  const push = ramp(frame, [0, 120], [1.32, 1.12], { easing: EASE.outSoft });

  return (
    <Stage>
      <PageShot src="graduation.png" focus={{ x: 50, y: 40, scale: push }} />

      {/* שכבת הקווקו שמתפוגגת */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0, opacity: 1 - reveal }}
      >
        <defs>
          <pattern
            id="hatch"
            width="14"
            height="14"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="14" stroke="#18181B" strokeOpacity={0.14} strokeWidth={6} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={1920} height={1080} fill="#FCFCFD" fillOpacity={0.55} />
        <rect x={0} y={0} width={1920} height={1080} fill="url(#hatch)" />
      </svg>

      <Caption text="78% קורסים · 18% סמינריונים · 4% רפרט" at={86} />
    </Stage>
  );
};
