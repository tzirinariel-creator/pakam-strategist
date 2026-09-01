import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, SHADOW } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { AppShell } from "../ui/AppShell";

/**
 * ס׳5 · 16.0–18.5 (75f) · הקטלוג
 * כרטיס: type-and-filter (interaction) — הקלדה, התכנסות הרשת, חדירה לפירוט.
 * כלל R3: מהירות ההקלדה היא של אדם אמיתי, לא של מכונה.
 *
 * 304 = CATALOG_COURSE_COUNT מ-`src/lib/constants.ts`, נעול בבדיקת vitest.
 */

const QUERY = "מיקרו";
const GRID = Array.from({ length: 12 }, (_, i) => i);

export const S05TypeFilter: React.FC = () => {
  const frame = useCurrentFrame();
  const chars = Math.floor(ramp(frame, [8, 34], [0, QUERY.length]));
  // הרשת מתכנסת: כל מה שאינו הכרטיס התואם נושר.
  const collapse = ramp(frame, [38, 58], [0, 1], { easing: EASE.outQuint });

  return (
    <Stage>
      <AppShell active="קטלוג" title="קטלוג הקורסים" subtitle="304 קורסים · דרישות קדם כלולות">
        {/* שדה החיפוש */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${frame > 6 && frame < 40 ? C.brand : C.border}`,
            borderRadius: 10,
            padding: "18px 24px",
            fontSize: 26,
            color: chars ? "rgba(24,24,27,0.85)" : "rgba(24,24,27,0.6)",
            marginBottom: 26,
            maxWidth: 700,
          }}
        >
          {chars ? QUERY.slice(0, chars) : "חיפוש קורס…"}
          {frame >= 8 && frame < 36 ? <span style={{ color: C.brand }}>|</span> : null}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {GRID.map((i) => {
            const isMatch = i === 4;
            const gone = isMatch ? 0 : collapse;
            const scale = isMatch ? 1 + 0.14 * collapse : 1 - 0.22 * gone;
            return (
              <div
                key={i}
                style={{
                  width: 330,
                  opacity: 1 - gone,
                  transform: `scale(${scale})`,
                  background: C.card,
                  border: `1px solid ${isMatch && collapse > 0.4 ? C.brand : C.border}`,
                  borderRadius: 10,
                  boxShadow: isMatch && collapse > 0.4 ? SHADOW.elevated : SHADOW.card,
                  padding: "22px 24px",
                }}
              >
                <div style={{ fontSize: 24, color: "rgba(24,24,27,0.85)" }}>
                  {isMatch ? "מיקרו כלכלה ב׳" : "קורס"}
                </div>
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 19,
                    color: "rgba(24,24,27,0.6)",
                    marginTop: 8,
                    direction: "ltr",
                  }}
                >
                  <bdi>{isMatch ? "1011-2020" : "0000-0000"}</bdi>
                </div>
              </div>
            );
          })}
        </div>
      </AppShell>
      <Caption text="304 קורסים. דרישות קדם כלולות." at={58} />
    </Stage>
  );
};
