import React from "react";
import { useCurrentFrame } from "remotion";
import { C, FONT, HE } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { CrownMark, Stage } from "../ui/Kit";

/**
 * ס׳8 · 24.9–29.9 (150f) · המלך הפילוסוף
 * כרטיס: ai-stream-response (interaction) — תשובה קודם, ראיות אחריה, מצב סיום.
 *
 * הכרטיס תואם מילה במילה את החוקה: "עונה קודם, בלי הקדמות, ולא ממציא מספרים."
 * השאלה והתשובה הן `king.chatQ` / `king.chatA` מ-`he.json` — לא נכתבו מחדש.
 *
 * חוק ברזל: אפס אייקוני AI גנריים. רק הכתר. הזהב מותר כאן ורק כאן —
 * זו רצועת המלך, המשטח הכהה היחיד שהמוצר מתיר.
 */

const Q = "כמה ש״ס חסר לי כדי לסגור את שנה ב׳?";
const ANSWER = "9 ש״ס: 5 בכלכלה, 4 בבחירה.";
const EVIDENCE = [
  "מיקרו ב׳ (5 ש״ס) סוגר לך את הכלכלה",
  "בדרישות הקדם שלו אתה כבר עומד",
  "לבחירה פתוחים 12 קורסים בסמסטר ב׳",
  "שלושה מהם בלי אף חפיפה במערכת שלך",
];

export const S08KingStream: React.FC = () => {
  const frame = useCurrentFrame();
  const qChars = Math.floor(ramp(frame, [4, 30], [0, Q.length]));
  const ansIn = ramp(frame, [40, 56], [0, 1]);
  const done = ramp(frame, [118, 130], [0, 1], { easing: EASE.spring });

  return (
    <Stage dark>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "90px 180px",
          display: "flex",
          flexDirection: "column",
          gap: 30,
          ...HE,
          color: "#ECECEE",
        }}
      >
        {/* כותרת המלך */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <CrownMark size={56} color={C.crownGoldBright} />
          <div style={{ fontSize: 34, fontWeight: 700, color: C.crownGoldBright }}>
            המלך הפילוסוף
          </div>
        </div>

        {/* השאלה */}
        <div
          style={{
            alignSelf: "flex-start",
            background: "rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "22px 28px",
            fontSize: 30,
            maxWidth: 1100,
          }}
        >
          {Q.slice(0, qChars)}
          {frame >= 4 && frame < 32 ? <span style={{ color: C.crownGoldBright }}>|</span> : null}
        </div>

        {/* התשובה נוחתת ראשונה — קודם המסקנה */}
        <div
          style={{
            opacity: ansIn,
            transform: `translateY(${(1 - ansIn) * 14}px)`,
            fontSize: 46,
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          {ANSWER}
        </div>

        {/* הראיות מתמלאות אחת־אחת */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
          {EVIDENCE.map((e, i) => {
            const t0 = 62 + i * 13;
            const o = ramp(frame, [t0, t0 + 14], [0, 1]);
            const x = ramp(frame, [t0, t0 + 16], [26, 0]);
            return (
              <div
                key={e}
                style={{
                  opacity: o,
                  transform: `translateX(${x}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  fontSize: 27,
                  color: "rgba(236,236,238,0.82)",
                }}
              >
                <span style={{ color: C.green, fontSize: 24 }}>✓</span>
                {e}
              </div>
            );
          })}
        </div>

        {/* מצב סיום */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            opacity: done,
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "rgba(236,236,238,0.6)",
            }}
          >
            שיחה לדוגמה. אצלכם התשובות מחושבות מהנתונים שלכם.
          </div>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 20,
              color: C.crownGoldBright,
              direction: "ltr",
            }}
          >
            <bdi>4 sources · 0 guesses</bdi>
          </div>
        </div>
      </div>
    </Stage>
  );
};
