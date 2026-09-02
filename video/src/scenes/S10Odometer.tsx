import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, HE } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Stage } from "../ui/Kit";

/**
 * ס׳10 · 32.4–37.4 (150f) · המספרים
 * כרטיס: odometer-digit-roll (data) — גלגול 63f + פעימה 8f + hold ≥45f.
 *
 * ⚠️ HIG · Right to Left: "אל תהפוך את סדר הספרות בתוך מספר." 304 נשאר 304;
 * רק סדר *נעילת* הספרות רץ, כמו במקור, משמאל לימין בתוך המספר עצמו.
 *
 * כל מספר כאן אמיתי ומאומת בקוד:
 *   304 — CATALOG_COURSE_COUNT (`src/lib/constants.ts:654`), נעול ב-vitest
 *   3   — FOCUS_DISCIPLINE_IDS.length
 *   150 — CREDIT_REQUIREMENTS.TOTAL
 */

const STATS: [string, string][] = [
  ["304", "קורסים אמיתיים"],
  ["3", "דיסציפלינות"],
  ["150", "ש״ס לתואר"],
];

const Digit: React.FC<{ target: string; lockAt: number }> = ({ target, lockAt }) => {
  const frame = useCurrentFrame();
  const locked = frame >= lockAt;
  const spin = ramp(frame, [0, lockAt], [0, 1], { easing: EASE.outQuint });
  // לפני הנעילה: גלגלת עם שארית־תנועה. אחריה: הספרה האמיתית.
  const shown = locked
    ? target
    : String(Math.floor((spin * 37 + Number(target)) % 10));
  const blur = locked ? 0 : (1 - spin) * 7;
  const y = locked ? 0 : (1 - spin) * -14;
  return (
    <span
      style={{
        display: "inline-block",
        filter: `blur(${blur}px)`,
        transform: `translateY(${y}px)`,
      }}
    >
      {shown}
    </span>
  );
};

export const S10Odometer: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = ramp(frame, [64, 72], [1, 1.045], { easing: EASE.spring });
  const settle = ramp(frame, [72, 84], [1.045, 1], { easing: EASE.outSoft });
  const scale = frame < 72 ? pulse : settle;

  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 120,
          ...HE,
          transform: `scale(${scale})`,
        }}
      >
        {STATS.map(([value, label], si) => {
          const appear = ramp(frame, [si * 8, si * 8 + 14], [0, 1]);
          return (
            <div key={label} style={{ textAlign: "center", opacity: appear }}>
              <bdi
                style={{
                  fontFamily: FONT.mono,
                  fontVariantNumeric: "tabular-nums",
                  direction: "ltr",
                  fontSize: 176,
                  fontWeight: 700,
                  color: si === 0 ? C.brand : C.ink,
                  lineHeight: 1,
                  display: "inline-flex",
                }}
              >
                {value.split("").map((d, i) => (
                  <Digit key={i} target={d} lockAt={26 + si * 6 + i * 9} />
                ))}
              </bdi>
              <div
                style={{
                  marginTop: 22,
                  fontSize: 30,
                  color: "rgba(24,24,27,0.6)",
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
