import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, HE, NUM, SHADOW } from "../theme";
import { ramp } from "../lib/anim";

/**
 * הבמה — הקנבס של פכמון.
 * `canvas-wash` מהאפליקציה: חמים למעלה, קריר למטה, שניהם בקושי שם.
 */
export const Stage: React.FC<{
  children: React.ReactNode;
  dark?: boolean;
}> = ({ children, dark }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: dark ? C.kingBand : C.bg,
      backgroundImage: dark
        ? undefined
        : `radial-gradient(120% 60% at 50% 0%, rgba(255,246,235,0.75) 0%, rgba(255,246,235,0) 60%),
           radial-gradient(120% 70% at 50% 100%, rgba(129,128,226,0.13) 0%, rgba(129,128,226,0) 65%)`,
      ...HE,
      color: dark ? "#ECECEE" : C.ink,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

/**
 * כתובית. כלל Q11 של הסקיל: טקסט שנועד להיקרא ≥5% מגובה הפריים.
 * 1080 × 5% = 54px — זה הרצפה כאן, לא ההמלצה.
 */
export const Caption: React.FC<{
  text: string;
  at: number;
  size?: number;
  dark?: boolean;
  bottom?: number;
}> = ({ text, at, size = 54, dark, bottom = 96 }) => {
  const frame = useCurrentFrame();
  const o = ramp(frame, [at, at + 10], [0, 1]);
  const y = ramp(frame, [at, at + 14], [16, 0]);
  return (
    <div
      style={{
        position: "absolute",
        bottom,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.35,
        color: dark ? "rgba(236,236,238,0.92)" : "rgba(24,24,27,0.85)",
        opacity: o,
        transform: `translateY(${y}px)`,
        ...HE,
        padding: "0 160px",
      }}
    >
      {text}
    </div>
  );
};

/** מספר — תמיד מונו, tabular, ומבודד ל-LTR ברמת ה-bdi בלבד. */
export const Num: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <bdi style={{ ...NUM, ...style }}>{children}</bdi>
);

/** כרטיס — הרדיוס והצל האמיתיים של המוצר. */
export const Card: React.FC<{
  children?: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
}> = ({ children, style, accent }) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      boxShadow: SHADOW.card,
      position: "relative",
      overflow: "hidden",
      ...style,
    }}
  >
    {accent ? (
      <div
        style={{
          position: "absolute",
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
    ) : null}
    {children}
  </div>
);

/**
 * המלך הפילוסוף — סמל המותג.
 * חוק ברזל: אין Sparkles ואין אייקוני AI גנריים. רק הכתר.
 */
export const CrownMark: React.FC<{ size?: number; color?: string }> = ({
  size = 64,
  color = C.crownGold,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 8.5l3.4 2.6L12 4l5.6 7.1L21 8.5l-1.7 9.2a1 1 0 0 1-1 .8H5.7a1 1 0 0 1-1-.8L3 8.5z"
      fill={color}
    />
    <circle cx="12" cy="20.6" r="1.1" fill={color} />
  </svg>
);

/** תווית־מיקרו. מילים בודדות בלבד, לפי שפת־העיצוב. */
export const Eyebrow: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({
  children,
  dark,
}) => (
  <div
    style={{
      fontFamily: FONT.body,
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: 0,
      color: dark ? "rgba(236,236,238,0.55)" : "rgba(24,24,27,0.6)",
    }}
  >
    {children}
  </div>
);
