import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, SHADOW } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { AppShell } from "../ui/AppShell";

/**
 * ס׳4 · 13.4–16.0 (78f) · המתכנן
 * כרטיס: deck-deal-flyin (ui-entrance) — אנרגיה גבוהה, פסגת הקצב.
 *
 * ⚠️ שיקוף RTL: החלוקה נכנסת מימין. בכרטיס המקורי הקלפים נזרקים משמאל.
 * כלל R2: אחרי שהלוח מלא — 0.5s עצירה (15f). שמור בפריימים 63–78.
 */

const COURSES: [string, string][] = [
  ["מבוא לפילוסופיה", "philosophy"],
  ["מיקרו א׳", "economics"],
  ["פוליטיקה השוואתית", "polsci"],
  ["לוגיקה", "philosophy"],
  ["מאקרו א׳", "economics"],
  ["יחב״ל", "polsci"],
  ["אתיקה", "philosophy"],
  ["סטטיסטיקה", "economics"],
  ["מנהל ציבורי", "polsci"],
];

const COL: Record<string, string> = {
  philosophy: C.philosophy,
  economics: C.economics,
  polsci: C.polsci,
};

export const S04DeckDeal: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Stage>
      <AppShell active="תכנון" title="תכנון התואר" subtitle="שלוש שנים, שישה סמסטרים">
        <div style={{ display: "flex", flexDirection: "row", gap: 20 }}>
          {["שנה א׳", "שנה ב׳", "שנה ג׳"].map((yr, col) => (
            <div key={yr} style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "rgba(24,24,27,0.6)",
                  marginBottom: 14,
                  textAlign: "center",
                }}
              >
                {yr}
              </div>
              <div
                style={{
                  minHeight: 520,
                  border: `1px dashed ${C.border}`,
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {COURSES.slice(col * 3, col * 3 + 3).map((c, row) => {
                  const idx = col * 3 + row;
                  // חלוקה קשיחה ומואצת — הקלף מגיע מחוץ לפריים מימין.
                  const t0 = 6 + idx * 5;
                  const p = ramp(frame, [t0, t0 + 16], [0, 1], { easing: EASE.outQuint });
                  const x = (1 - p) * 900;
                  const rot = (1 - p) * 9;
                  return (
                    <div
                      key={c[0]}
                      style={{
                        opacity: p > 0.02 ? 1 : 0,
                        transform: `translateX(${x}px) rotate(${rot}deg)`,
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderInlineStartWidth: 3,
                        borderInlineStartColor: COL[c[1]],
                        borderInlineStartStyle: "solid",
                        borderRadius: 10,
                        boxShadow: SHADOW.card,
                        padding: "20px 22px",
                        fontSize: 24,
                        color: "rgba(24,24,27,0.85)",
                      }}
                    >
                      {c[0]}
                      <div
                        style={{
                          fontFamily: FONT.mono,
                          fontSize: 19,
                          color: "rgba(24,24,27,0.6)",
                          marginTop: 6,
                          direction: "ltr",
                        }}
                      >
                        <bdi>4</bdi>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </AppShell>
      <Caption text="כל הקורסים, מסודרים לפי סמסטרים" at={56} />
    </Stage>
  );
};
