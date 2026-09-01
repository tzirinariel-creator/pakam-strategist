import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, SHADOW } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { AppShell } from "../ui/AppShell";

/**
 * ס׳6 · 18.5–20.5 (60f) · מערכת השעות
 * כרטיס: row-embed (ui-entrance) — שורות יורדות מהאוויר, rotateX מיישר,
 * וברגע ההשתלבות נדלק חריץ בצבע ההדגשה בקצה התחתון.
 *
 * ⚠️ RTL: בעברית השבוע מתחיל מימין — א׳ הוא העמוד הימני ביותר.
 */

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳"];
const SLOTS: [number, number, string, string][] = [
  [0, 0, "מיקרו ב׳", C.economics],
  [1, 1, "לוגיקה", C.philosophy],
  [2, 0, "יחב״ל", C.polsci],
  [3, 2, "סמינר", C.philosophy],
  [4, 1, "מאקרו", C.economics],
];

export const S06RowEmbed: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Stage>
      <AppShell active="מערכת" title="מערכת השעות" subtitle="נבנית מהקורסים שבחרתם">
        <div style={{ display: "flex", flexDirection: "row", gap: 14 }}>
          {DAYS.map((d, di) => (
            <div key={d} style={{ flex: 1 }}>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 23,
                  fontWeight: 600,
                  color: "rgba(24,24,27,0.6)",
                  marginBottom: 12,
                }}
              >
                {d}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[0, 1, 2].map((row) => {
                  const slot = SLOTS.find((s) => s[0] === di && s[1] === row);
                  if (!slot) {
                    return (
                      <div
                        key={row}
                        style={{
                          height: 118,
                          border: `1px dashed ${C.borderSubtle}`,
                          borderRadius: 10,
                        }}
                      />
                    );
                  }
                  const t0 = 4 + di * 5 + row * 3;
                  const p = ramp(frame, [t0, t0 + 20], [0, 1], { easing: EASE.outQuint });
                  const seam = ramp(frame, [t0 + 18, t0 + 26], [1, 0]);
                  return (
                    <div
                      key={row}
                      style={{
                        height: 118,
                        position: "relative",
                        opacity: p > 0.03 ? 1 : 0,
                        transform: `perspective(900px) rotateX(${(1 - p) * 62}deg) translateY(${(1 - p) * -70}px)`,
                        transformOrigin: "bottom center",
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        boxShadow: SHADOW.card,
                        padding: "16px 18px",
                      }}
                    >
                      <div style={{ fontSize: 22, color: "rgba(24,24,27,0.85)" }}>{slot[2]}</div>
                      <div
                        style={{
                          fontFamily: FONT.mono,
                          fontSize: 18,
                          color: "rgba(24,24,27,0.6)",
                          marginTop: 6,
                        }}
                      >
                        <bdi>10:00–12:00</bdi>
                      </div>
                      {/* החריץ שנדלק ברגע ההשתלבות */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: 3,
                          background: slot[3],
                          opacity: seam,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </AppShell>
      <Caption text="מערכת שבועית שנבנית לבד" at={40} />
    </Stage>
  );
};
