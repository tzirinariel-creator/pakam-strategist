import React from "react";
import { useCurrentFrame } from "remotion";
import { C, HE } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Stage } from "../ui/Kit";

/**
 * ס׳2 · 5.6–8.4 (83f) · המותג
 * כרטיס: brand-ink-open (opening) — כוונת דיו → חתימת אותיות → כותרת משנה
 * במכונת כתיבה → hold מלא של שנייה → ריחוף והתפוגגות.
 *
 * ⚠️ שיקוף RTL: החתימה רצה ימין→שמאל. אות ראשונה = פ (הימנית ביותר).
 * כלל R1: ה-hold על הצירוף הוא 30 פריימים מלאים ואינו נמחק לקיצור.
 */

const WORD = "פכמון";
const SUB = "שלושה חוגים, תואר אחד — ומקום אחד לנהל אותו";

export const S02BrandInk: React.FC = () => {
  const frame = useCurrentFrame();

  const cross = ramp(frame, [0, 16], [0, 1], { easing: EASE.outSoft });
  const crossOut = ramp(frame, [20, 30], [1, 0]);
  // מכונת כתיבה לכותרת המשנה
  const subChars = Math.floor(ramp(frame, [40, 66], [0, SUB.length]));
  // hold מלא של שנייה מפריים 66, ואז ריחוף למעלה והתפוגגות
  const lift = ramp(frame, [72, 83], [0, -26], { easing: EASE.in });
  const fade = ramp(frame, [74, 83], [1, 0]);

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
          gap: 26,
          transform: `translateY(${lift}px)`,
          opacity: fade,
          ...HE,
        }}
      >
        {/* כוונת הדיו */}
        <svg width={200} height={200} style={{ position: "absolute", opacity: crossOut }}>
          <line
            x1={100} y1={100 - 70 * cross} x2={100} y2={100 + 70 * cross}
            stroke={C.ink} strokeOpacity={0.18} strokeWidth={1.5}
          />
          <line
            x1={100 - 70 * cross} y1={100} x2={100 + 70 * cross} y2={100}
            stroke={C.ink} strokeOpacity={0.18} strokeWidth={1.5}
          />
        </svg>

        {/* חתימת האותיות — ימין→שמאל */}
        <div style={{ display: "flex", flexDirection: "row", fontSize: 132, fontWeight: 700, color: C.ink }}>
          {WORD.split("").map((ch, i) => {
            // האות הראשונה בעברית היא הימנית; flex ב-RTL כבר מסדר, אז i הוא סדר החתימה.
            const t0 = 14 + i * 5;
            const s = ramp(frame, [t0, t0 + 9], [1.5, 1], { easing: EASE.outQuint });
            const o = ramp(frame, [t0, t0 + 7], [0, 1]);
            return (
              <span key={i} style={{ opacity: o, transform: `scale(${s})`, display: "inline-block" }}>
                {ch}
              </span>
            );
          })}
        </div>

        {/* כותרת משנה במכונת כתיבה */}
        <div style={{ fontSize: 34, color: "rgba(24,24,27,0.6)", minHeight: 48 }}>
          {SUB.slice(0, subChars)}
          {frame >= 40 && frame < 66 ? (
            <span style={{ color: C.brand }}>|</span>
          ) : null}
        </div>
      </div>
    </Stage>
  );
};
