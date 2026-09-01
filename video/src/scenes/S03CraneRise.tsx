import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { AppShell, StatCard } from "../ui/AppShell";

/**
 * ס׳3 · 8.4–13.4 (150f) · מסך הבית
 * כרטיס: crane-rise-reveal (opening) — קלוז־אפ 20f + עלייה 100f + סטילס 30f.
 *
 * עיקרון Q5: לפתיחה יש גיבור אחד. הגיבור כאן הוא מונה הש״ס — וזה גם
 * העיקרון של המוצר עצמו: "מספרים הם הגיבורים".
 *
 * המספרים אמיתיים: 150 ש״ס לתואר (CREDIT_REQUIREMENTS.TOTAL).
 */

export const S03CraneRise: React.FC = () => {
  const frame = useCurrentFrame();

  // המצלמה: מתחילה צמודה על שורת הנתון, עולה ונסוגה עד לפריים מלא.
  const zoom = ramp(frame, [20, 120], [3.05, 1], { easing: EASE.outQuint });
  const panY = ramp(frame, [20, 120], [250, 0], { easing: EASE.outQuint });

  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${zoom}) translateY(${panY}px)`,
          transformOrigin: "38% 34%",
        }}
      >
        <AppShell active="בית" title="שלום, אריאל" subtitle="הנה איפה אתם עומדים בתואר">
          <div style={{ display: "flex", gap: 22, marginBottom: 26 }}>
            <StatCard label="ש״ס שנצברו" value="88" unit="מתוך 150" style={{ flex: 1 }} />
            <StatCard label="ממוצע נוכחי" value="87.4" accent={C.philosophy} style={{ flex: 1 }} />
            <StatCard label="שנה" value="ב׳" accent={C.economics} style={{ flex: 1 }} />
          </div>

          {/* שורות שזורמות פנימה בזמן העלייה */}
          {[
            ["מיקרו כלכלה ב׳", "5 ש״ס", C.economics],
            ["תורת המדינה", "4 ש״ס", C.polsci],
            ["פילוסופיה של המדע", "4 ש״ס", C.philosophy],
            ["סמינר: צדק חלוקתי", "6 ש״ס", C.philosophy],
          ].map(([name, cr, col], i) => {
            const t0 = 44 + i * 9;
            const o = ramp(frame, [t0, t0 + 16], [0, 1]);
            const y = ramp(frame, [t0, t0 + 18], [22, 0]);
            return (
              <div
                key={name as string}
                style={{
                  opacity: o,
                  transform: `translateY(${y}px)`,
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "18px 24px",
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderInlineStartWidth: 3,
                  borderInlineStartColor: col as string,
                  borderInlineStartStyle: "solid",
                }}
              >
                <span style={{ fontSize: 25, color: "rgba(24,24,27,0.85)" }}>{name}</span>
                <bdi style={{ fontSize: 22, color: "rgba(24,24,27,0.6)" }}>{cr}</bdi>
              </div>
            );
          })}
        </AppShell>
      </div>

      <Caption text="מקום אחד שיודע איפה אתם עומדים" at={122} />
    </Stage>
  );
};
