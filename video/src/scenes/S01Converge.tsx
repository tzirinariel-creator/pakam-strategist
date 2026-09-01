import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, HE, SHADOW } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";

/**
 * ס׳1 · 0:00–5.6 (168f) · הבעיה
 * כרטיס: bezier-source-converge-merge (ui-entrance)
 *
 * ⚠️ שיקוף RTL — הכרטיס המקורי רץ שמאל→ימין. בעברית המקורות בימין
 * וההתכנסות בשמאל. HIG · Right to Left: "הפוך את מיקומם של דימויים כאשר
 * הסדר שלהם נושא משמעות."
 *
 * הטקסט הוא הטקסט של הנחיתה (`he.json` landing.proof) — לא נכתב מחדש.
 */

const SOURCES = [
  { title: "הידיעון", body: "טבלת ASP.NET משנות ה-2000" },
  { title: "התקנון", body: "PDF שאף אחד לא קורא עד הסוף" },
  { title: "האקסל", body: "תכנון-תואר-גרסה-סופית-3(2).xlsx" },
  { title: "הוואטסאפ", body: "״מישהו יודע אם זה נחשב בחירה?״" },
];

const SRC_X = 1430;
const DST_X = 430;
const DST_Y = 470;
const NODE_H = 132;

const srcY = (i: number) => 250 + i * (NODE_H + 44);

/** נקודות הבקרה של העקומה מהמקור (ימין) אל ההתכנסות (שמאל). */
const ctrl = (i: number) => {
  const y = srcY(i) + NODE_H / 2;
  const midX = (SRC_X + DST_X) / 2;
  return {
    p0: [SRC_X, y],
    p1: [midX, y],
    p2: [midX, DST_Y],
    p3: [DST_X, DST_Y],
  } as const;
};

const pathFor = (i: number) => {
  const { p0, p1, p2, p3 } = ctrl(i);
  return `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;
};

/** נקודה על עקומת בזייה קובית ב-t — מחושבת ידנית כדי שהרנדר יהיה דטרמיניסטי. */
const bezierAt = (i: number, t: number): [number, number] => {
  const { p0, p1, p2, p3 } = ctrl(i);
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
};

export const S01Converge: React.FC = () => {
  const frame = useCurrentFrame();

  // ההתכנסות: כל צומת גולש על העקומה שלו, מתכווץ ונבלע.
  const mergeStart = 92;
  const mergeSpan = 34;

  return (
    <Stage>
      {/* העקומות */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
      >
        {SOURCES.map((_, i) => {
          const drawIn = 22 + i * 7;
          const draw = ramp(frame, [drawIn, drawIn + 42], [0, 1], {
            easing: EASE.outSoft,
          });
          // מחיקה הפוכה אחרי הבליעה — מהקצה הימני פנימה.
          const erase = ramp(frame, [138, 158], [0, 1], { easing: EASE.in });
          return (
            <path
              key={i}
              d={pathFor(i)}
              fill="none"
              stroke={C.brand}
              strokeOpacity={0.28}
              strokeWidth={2}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - draw + erase}
            />
          );
        })}
      </svg>

      {/* מנות־נתונים שמחליקות על המסלול */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {SOURCES.map((_, i) => {
          const t0 = 58 + i * 6;
          const p = ramp(frame, [t0, t0 + 52], [0, 1], { easing: EASE.standard });
          const vis = frame > t0 && frame < t0 + 56 ? 1 : 0;
          const [cx, cy] = bezierAt(i, p);
          return <circle key={i} cx={cx} cy={cy} r={7} fill={C.brand} opacity={vis} />;
        })}
      </svg>

      {/* ארבעת המקורות */}
      {SOURCES.map((s, i) => {
        const appear = ramp(frame, [i * 6, i * 6 + 16], [0, 1]);
        const m = ramp(frame, [mergeStart + i * 5, mergeStart + i * 5 + mergeSpan], [0, 1], {
          easing: EASE.in,
        });
        const y = srcY(i);
        const x = SRC_X - 360 + (DST_X - SRC_X + 300) * m;
        const yy = y + (DST_Y - NODE_H / 2 - y) * m;
        return (
          <div
            key={s.title}
            style={{
              position: "absolute",
              left: x,
              top: yy,
              width: 360,
              height: NODE_H,
              opacity: appear * (1 - m),
              transform: `scale(${1 - 0.45 * m})`,
              transformOrigin: "center",
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              boxShadow: SHADOW.card,
              padding: "20px 24px",
              ...HE,
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: C.ink }}>
              {s.title}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 21,
                lineHeight: 1.4,
                color: "rgba(24,24,27,0.6)",
              }}
            >
              {s.body}
            </div>
          </div>
        );
      })}

      {/* הסמל שנשאר אחרי הבליעה */}
      {(() => {
        const pop = ramp(frame, [126, 144], [0, 1], { easing: EASE.spring });
        return (
          <div
            style={{
              position: "absolute",
              left: DST_X - 58,
              top: DST_Y - 58,
              width: 116,
              height: 116,
              borderRadius: "50%",
              background: C.brand,
              opacity: pop,
              transform: `scale(${0.6 + 0.4 * pop})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.brandFg,
              fontFamily: FONT.body,
              fontSize: 34,
              fontWeight: 700,
              boxShadow: SHADOW.float,
            }}
          >
            פ
          </div>
        );
      })()}

      <Caption text="המידע קיים. הוא רק מפוזר." at={24} />
    </Stage>
  );
};
