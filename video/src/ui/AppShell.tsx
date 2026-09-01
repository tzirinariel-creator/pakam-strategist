import React from "react";
import { C, FONT, HE, SHADOW } from "../theme";

/**
 * שלד האפליקציה — סיידבר בימין (RTL), תוכן בשמאל.
 *
 * ⚠️ הערת הפקה: זה mock, לא צילום מסך. עיקרון Q1 של video-shotcraft דורש
 * צילומי מסך אמיתיים משרת dev חי כשמשחזרים עמוד קיים. לא ניתן להריץ כאן
 * (אין `.env` ב-worktree, וה-DB הוא פרודקשן עם משתמשים אמיתיים), ולכן ה-mock
 * הזה הוא ממלא־מקום מכוון: הוא נבנה מהטוקנים האמיתיים כדי שהקומפוזיציה,
 * העיתוי וה-RTL יהיו נכונים — אבל לפני רנדר סופי יש להחליף את התוכן
 * בצילומי מסך אמיתיים של פרופיל דמו מוקפא.
 */

const NAV = ["בית", "תכנון", "מערכת", "תקנון", "מכרז", "מבחנים", "קטלוג", "תיק"];

export const AppShell: React.FC<{
  children?: React.ReactNode;
  active?: string;
  title?: string;
  subtitle?: string;
}> = ({ children, active = "בית", title, subtitle }) => (
  <div
    style={{
      width: 1920,
      height: 1080,
      display: "flex",
      flexDirection: "row",
      background: C.bg,
      ...HE,
    }}
  >
    {/* סיידבר — בימין */}
    <div
      style={{
        width: 300,
        background: C.card,
        borderInlineStart: `1px solid ${C.border}`,
        padding: "36px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 700, color: C.ink, marginBottom: 28 }}>
        פכמון
      </div>
      {NAV.map((n) => {
        const on = n === active;
        return (
          <div
            key={n}
            style={{
              padding: "13px 18px",
              borderRadius: 10,
              fontSize: 23,
              fontWeight: on ? 600 : 400,
              background: on ? C.brandMuted : "transparent",
              color: on ? C.brand : "rgba(24,24,27,0.6)",
            }}
          >
            {n}
          </div>
        );
      })}
    </div>

    {/* תוכן */}
    <div style={{ flex: 1, padding: "44px 56px", overflow: "hidden" }}>
      {title ? (
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 34 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 14,
              background: C.brandMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.brand,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            ◆
          </div>
          <div>
            <div style={{ fontSize: 40, fontWeight: 700, color: "rgba(24,24,27,0.85)" }}>
              {title}
            </div>
            {subtitle ? (
              // /60 — רצפת ה-AA החדשה. קודם זה היה /55 = 3.90:1 ונכשל.
              <div style={{ fontSize: 23, color: "rgba(24,24,27,0.6)", marginTop: 4 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  </div>
);

/** כרטיס נתון עם מספר־על — התבנית של degree-status באפליקציה. */
export const StatCard: React.FC<{
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ label, value, unit, accent = C.brand, style }) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      boxShadow: SHADOW.card,
      padding: "26px 30px",
      position: "relative",
      overflow: "hidden",
      ...style,
    }}
  >
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
    <div style={{ fontSize: 21, color: "rgba(24,24,27,0.6)", marginBottom: 10 }}>
      {label}
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <bdi
        style={{
          fontFamily: FONT.mono,
          fontVariantNumeric: "tabular-nums",
          direction: "ltr",
          fontSize: 58,
          fontWeight: 700,
          color: accent,
        }}
      >
        {value}
      </bdi>
      {unit ? (
        <span style={{ fontSize: 24, color: "rgba(24,24,27,0.6)" }}>{unit}</span>
      ) : null}
    </div>
  </div>
);
