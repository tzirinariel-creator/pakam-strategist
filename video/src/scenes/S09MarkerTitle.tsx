import React from "react";
import { useCurrentFrame } from "remotion";
import { C, HE } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Stage } from "../ui/Kit";

/**
 * ס׳9 · 29.9–32.4 (75f) · הבידול
 * כרטיס: marker-underline-title (typography) — כותרת נוחתת, ואז קו מרקר
 * נמתח במהירות מתחת למילת המפתח.
 *
 * ⚠️ שיקוף RTL: הקו נמתח ימין→שמאל. בכרטיס המקורי הוא נמתח שמאל→ימין.
 *
 * זה הבידול האמיתי של המוצר — עקרון הכנות מהחוקה: "לעולם לא לנבא נקודות
 * בידינג / להמציא תאריך או ציון או נתון".
 */

export const S09MarkerTitle: React.FC = () => {
  const frame = useCurrentFrame();

  const titleIn = ramp(frame, [0, 16], [0, 1]);
  const titleY = ramp(frame, [0, 18], [22, 0]);
  // הקו נמתח מהקצה הימני שמאלה
  const draw = ramp(frame, [26, 44], [0, 1], { easing: EASE.outQuint });
  const subIn = ramp(frame, [48, 62], [0, 1]);

  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          ...HE,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: C.ink,
            opacity: titleIn,
            transform: `translateY(${titleY}px)`,
            position: "relative",
          }}
        >
          אין נתון? כתוב{" "}
          <span style={{ position: "relative", display: "inline-block" }}>
            טרם פורסם
            {/* קו המרקר — נמתח מימין לשמאל, קצה מחוספס, נטוי קלות */}
            <svg
              width={430}
              height={30}
              style={{
                position: "absolute",
                insetInlineStart: 0,
                bottom: -14,
                overflow: "visible",
              }}
            >
              <path
                d={`M 430 14 L ${430 - 430 * draw} 19`}
                stroke={C.brand}
                strokeOpacity={0.55}
                strokeWidth={18}
                strokeLinecap="round"
              />
            </svg>
          </span>
        </div>

        <div
          style={{
            fontSize: 38,
            color: "rgba(24,24,27,0.6)",
            opacity: subIn,
          }}
        >
          לא מנחשים ניקוד בידינג. לא ממציאים תאריך.
        </div>
      </div>
    </Stage>
  );
};
