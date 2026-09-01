import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { AppShell } from "../ui/AppShell";

/**
 * ס׳7 · 20.5–24.9 (132f) · מחשבון ציון הגמר — ביט הכנות
 * כרטיס: hatch-depth (data) — צמיחה 0–1.7s · גלגול 2.2–3.4s · רעד סיום.
 *
 * זה הרגע החשוב בסרטון. הקווקו הוא בדיוק השפה של פכמון:
 * "קו מקווקו = כאן יהיה משהו, קו מלא = זה קיים."
 *
 * המשקולות אמיתיות: 78% קורסים · 18% סמינריונים · 4% רפרט (landing.features.grades).
 */

const BARS: [string, number, string][] = [
  ["קורסים", 78, C.brand],
  ["סמינריונים", 18, C.philosophy],
  ["רפרט", 4, C.economics],
];

export const S07HatchDepth: React.FC = () => {
  const frame = useCurrentFrame();
  // שלב 1: הקווקו נמתח. שלב 2: מתפוגג ומתחלף בשכבה מלאה + מספר.
  const morph = ramp(frame, [66, 102], [0, 1], { easing: EASE.outSoft });

  return (
    <Stage>
      <AppShell active="בית" title="מחשבון ציון הגמר" subtitle="ציון הגמר אינו הממוצע הפשוט">
        <svg width={0} height={0}>
          <defs>
            <pattern id="hatch" width="12" height="12" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="12" stroke={C.ink} strokeOpacity={0.22} strokeWidth={5} />
            </pattern>
          </defs>
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 34, maxWidth: 1180 }}>
          {BARS.map(([label, pct, col], i) => {
            const t0 = 6 + i * 14;
            const grow = ramp(frame, [t0, t0 + 44], [0, 1], { easing: EASE.outQuint });
            const width = (pct / 100) * 1000 * grow;
            const numPop = ramp(frame, [84 + i * 8, 96 + i * 8], [0, 1], { easing: EASE.spring });
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 26 }}>
                <div style={{ width: 210, fontSize: 27, color: "rgba(24,24,27,0.85)", textAlign: "start" }}>
                  {label}
                </div>
                <div style={{ position: "relative", height: 62, width: 1000 }}>
                  {/* שכבת הקווקו — "כאן יהיה משהו" */}
                  <svg width={1000} height={62} style={{ position: "absolute", opacity: 1 - morph }}>
                    <rect x={0} y={0} width={width} height={62} rx={8} fill="url(#hatch)" />
                    <rect x={0} y={0} width={width} height={62} rx={8} fill="none" stroke={C.border} />
                  </svg>
                  {/* השכבה המלאה — "זה קיים" */}
                  <div
                    style={{
                      position: "absolute",
                      insetInlineStart: 0,
                      top: 0,
                      width,
                      height: 62,
                      borderRadius: 8,
                      background: col,
                      opacity: morph,
                    }}
                  />
                </div>
                <bdi
                  style={{
                    fontFamily: FONT.mono,
                    fontVariantNumeric: "tabular-nums",
                    direction: "ltr",
                    fontSize: 42,
                    fontWeight: 700,
                    color: col,
                    opacity: numPop,
                    transform: `scale(${0.8 + 0.2 * numPop})`,
                  }}
                >
                  {pct}%
                </bdi>
              </div>
            );
          })}
        </div>
      </AppShell>
      <Caption text="78% קורסים · 18% סמינריונים · 4% רפרט" at={104} />
    </Stage>
  );
};
