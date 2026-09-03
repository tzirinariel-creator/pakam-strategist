import React from "react";
import { Img, staticFile } from "remotion";

/**
 * חלק אחד מתוך צילום מסך, שאפשר להרים אותו מהעמוד.
 *
 * הדרך היחידה לתת ל"כרטיס" גוף — גובה, צל שגדל, זווית — בלי לצייר UI ביד
 * (שהסקיל אוסר כשמשחזרים עמוד קיים, Q1) היא לחתוך אזור מהצילום ולהזיז
 * אותו כשכבה נפרדת. המכולה חותכת, התמונה בפנים מוזזת ב-‎-x/-y כך שרק
 * האזור הנכון נראה.
 */
export const HeroLift: React.FC<{
  src: string;
  box: { x: number; y: number; w: number; h: number };
  lift: number;
  z: number;
  press: number;
  radius?: number;
}> = ({ src, box, lift, z, press, radius = 14 }) => {
  // הצל חייב לגדול עם הגובה, אחרת הריחוף לא משכנע (כרטיס־השוט, "双层影")
  const shadow =
    `0 ${8 * lift}px ${10 + 12 * lift}px rgba(24,24,40,${0.16 * lift}),` +
    ` 0 ${46 * lift}px ${90 * lift}px rgba(24,24,40,${0.2 * lift})`;

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        overflow: "hidden",
        borderRadius: radius,
        boxShadow: shadow,
        transform: `translateY(${-z}px) scale(${press})`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      <Img
        src={staticFile(`shots/${src}`)}
        style={{
          position: "absolute",
          left: -box.x,
          top: -box.y,
          width: 1920,
          height: 1080,
          display: "block",
        }}
      />
    </div>
  );
};

/**
 * המשבצת שהכרטיס עזב: טלאי ברקע העמוד + מסגרת נושמת בצבע ההדגשה.
 * בלעדיה נראה כאילו הכרטיס משוכפל ולא הורם.
 */
export const VacatedSlot: React.FC<{
  box: { x: number; y: number; w: number; h: number };
  visible: number;
  landPulse: number;
  accent: string;
  patch: string;
  radius?: number;
}> = ({ box, visible, landPulse, accent, patch, radius = 14 }) => (
  <div
    style={{
      position: "absolute",
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      borderRadius: radius,
      background: patch,
      border: `2px solid ${accent}`,
      opacity: visible * (0.55 + 0.45 * Math.max(visible, landPulse)),
      boxShadow: landPulse > 0 ? `0 0 ${28 * landPulse}px ${accent}` : undefined,
    }}
  />
);

/**
 * אלומת מתאר שרצה סביב הגיבור. שתי הקפות: הראשונה מהירה ובהירה,
 * השנייה איטית וחלשה — הקפה אחת נקראת כמצמוץ, לא כסריקה.
 * כלל Q4: אפקט־אור אחד, ורק לגיבור.
 */
export const OutlineBeam: React.FC<{
  box: { x: number; y: number; w: number; h: number };
  z: number;
  lap1: number;
  lap2: number;
  color: string;
  radius?: number;
}> = ({ box, z, lap1, lap2, color, radius = 14 }) => {
  const laps = [
    { p: lap1, w: 5, glow: 2.5, o: 1 },
    { p: lap2, w: 3.5, glow: 1.75, o: 0.62 },
  ];
  return (
    <svg
      width={box.w + 40}
      height={box.h + 40}
      style={{
        position: "absolute",
        left: box.x - 20,
        top: box.y - 20 - z,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {laps.map((l, i) =>
        l.p > 0 && l.p < 1 ? (
          <g key={i} opacity={l.o}>
            <rect
              x={20} y={20} width={box.w} height={box.h} rx={radius}
              fill="none" stroke={color} strokeWidth={l.w + l.glow}
              strokeOpacity={0.35}
              pathLength={1} strokeDasharray="0.14 1" strokeDashoffset={-l.p}
              style={{ filter: "blur(3px)" }}
            />
            <rect
              x={20} y={20} width={box.w} height={box.h} rx={radius}
              fill="none" stroke={color} strokeWidth={l.w}
              pathLength={1} strokeDasharray="0.14 1" strokeDashoffset={-l.p}
            />
          </g>
        ) : null,
      )}
    </svg>
  );
};
