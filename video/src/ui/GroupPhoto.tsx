import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

/**
 * "תמונה קבוצתית של השקה" — כלל Q8.
 *
 * הכלל: *"הסיום של מוצר רב־יכולות נעשה במבנה תמונה־משפחתית: כל פיצ'ר
 * שהוצג שולח נציג אחד שנכנס מכיוון אחר ונעצר; הרמה תואמת את שיא האנרגיה
 * של הסרט. **גרסה ראשונה של סיום כמעט תמיד שמרנית מדי — הוסף דרגה
 * כברירת מחדל.**"*
 *
 * הסיום הקודם היה lockup שקט על קנבס ריק. כאן ששת המסכים שהסרטון הראה
 * חוזרים כנציגים — כל אחד מכיוון אחר, בהטיה, עם צל — ומקיפים את הצירוף.
 * הם נכנסים לפני הצירוף ונעצרים לגמרי כשהוא נוחת, כדי שהוא יישאר הגיבור.
 */

type Rep = {
  src: string;
  /** מאיפה הוא מגיע, במעלות סביב המרכז. 0 = ימין, 90 = מטה. */
  angle: number;
  /** המרחק הסופי מהמרכז */
  radius: number;
  scale: number;
  tilt: number;
  delay: number;
};

/** ששת המסכים שהסרטון הראה, בסדר שבו הוא הראה אותם. */
const REPS: Rep[] = [
  { src: "planner.png", angle: 200, radius: 560, scale: 0.30, tilt: -9, delay: 0 },
  { src: "dashboard.png", angle: 250, radius: 500, scale: 0.27, tilt: 7, delay: 4 },
  { src: "catalog.png", angle: 300, radius: 580, scale: 0.26, tilt: -6, delay: 8 },
  { src: "calendar.png", angle: 20, radius: 560, scale: 0.28, tilt: 8, delay: 12 },
  { src: "graduation.png", angle: 70, radius: 520, scale: 0.26, tilt: -7, delay: 16 },
  { src: "regulations.png", angle: 130, radius: 570, scale: 0.27, tilt: 6, delay: 20 },
];

const FLY = Easing.bezier(0.16, 1, 0.3, 1);

export const GroupPhoto: React.FC<{
  /** הפריים שבו הנציג הראשון מתחיל */
  start: number;
  /** משך הכניסה של כל נציג */
  dur?: number;
}> = ({ start, dur = 30 }) => {
  const frame = useCurrentFrame();

  return (
    <>
      {REPS.map((r) => {
        const t0 = start + r.delay;
        const p = interpolate(frame, [t0, t0 + dur], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: FLY,
        });
        if (p <= 0) return null;

        const rad = (r.angle * Math.PI) / 180;
        // מגיע מחוץ לפריים לאורך אותו רדיוס, ונעצר במרחק הסופי
        const dist = r.radius + (1 - p) * 1250;
        const x = Math.cos(rad) * dist;
        const y = Math.sin(rad) * dist * 0.62;
        const scale = r.scale * (0.82 + 0.18 * p);
        const tilt = r.tilt * p;

        return (
          <div
            key={r.src}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 1920,
              height: 1080,
              marginLeft: -960,
              marginTop: -540,
              transform:
                `translate(${x}px, ${y}px) scale(${scale}) rotate(${tilt}deg)`,
              transformOrigin: "center center",
              opacity: Math.min(1, p * 2.2),
              borderRadius: 26 / r.scale,
              overflow: "hidden",
              boxShadow: `0 ${40}px ${120}px rgba(24,24,40,0.22)`,
              // הנציגים מאחורי הצירוף — הוא נשאר הגיבור
              zIndex: 0,
            }}
          >
            <Img
              src={staticFile(`shots/${r.src}`)}
              style={{ width: 1920, height: 1080, display: "block" }}
            />
          </div>
        );
      })}
    </>
  );
};

/**
 * אבק זהב. חלקיקים דטרמיניסטיים (seed קבוע) — `Math.random` היה נותן
 * פריים אחר בכל רנדר, וזה מה שהופך רנדר מחדש ללא־ניתן־להשוואה.
 */
export const GoldDust: React.FC<{ start: number; count?: number; color: string }> = ({
  start,
  count = 46,
  color,
}) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  if (t < 0) return null;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        // מחולל ליניארי פשוט — אותו זרע, אותו פריים, תמיד
        const s = (i * 9301 + 49297) % 233280;
        const rx = (s % 1000) / 1000;
        const ry = ((s >> 3) % 1000) / 1000;
        const rs = ((s >> 6) % 1000) / 1000;

        const life = 70 + rs * 40;
        const p = Math.min(1, t / life);
        const x = 960 + (rx - 0.5) * 1500;
        const y = 1080 - p * (420 + ry * 460);
        const o = Math.sin(p * Math.PI) * (0.28 + rs * 0.34);
        const size = 2 + rs * 3.2;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              opacity: o,
              filter: "blur(0.4px)",
            }}
          />
        );
      })}
    </>
  );
};
