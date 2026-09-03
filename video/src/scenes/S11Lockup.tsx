import React from "react";
import { useCurrentFrame } from "remotion";
import { C, HE } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { CrownMark, Stage } from "../ui/Kit";

/**
 * ס׳11 · 37.4–41.8 (132f) · סיום
 * כרטיס: logo-shrink-wordmark-lockup (outro) —
 * התכנסות 0.1–1.2s · פינוי מקום 1.5–2.1s · אותיות 2–2.7s · סלוגן 3.2–3.7s.
 *
 * כלל R1: ה-hold על ה-lockup הוא שנייה מלאה לפחות. פריימים 100–132.
 */

const WORD = "פכמון";

export const S11Lockup: React.FC = () => {
  const frame = useCurrentFrame();

  // העיגול מתכנס מגודל מלא לסמל קטן, עם בלימת־יתר קלה.
  const shrink = ramp(frame, [3, 36], [1, 0.14], { easing: EASE.outQuint });
  // האייקון מפנה מקום — בעברית הוא זז ימינה, האותיות נכנסות משמאלו.
  const shift = ramp(frame, [45, 63], [0, 1], { easing: EASE.outSoft });
  const sloganIn = ramp(frame, [96, 112], [0, 1]);
  // הכתובת נכנסת אחרונה ונשארת עד הפריים האחרון. סרטון שיווקי שלא אומר
  // לאן ללכת מבזבז את כל מה שקדם לו — וזה בדיוק מה שהיה כאן: 41.8 שניות
  // מוצר, ואז מסך סיום בלי שום דרך להגיע אליו.
  const urlIn = ramp(frame, [110, 124], [0, 1]);

  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          ...HE,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 24 }}>
          {/* הסמל */}
          <div
            style={{
              width: 640 * shrink + 40,
              height: 640 * shrink + 40,
              borderRadius: "50%",
              background: C.brand,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `translateX(${shift * 0}px)`,
              flexShrink: 0,
            }}
          >
            <CrownMark size={(640 * shrink + 40) * 0.52} color={C.crownGoldBright} />
          </div>

          {/* האותיות נכנסות אחת־אחת */}
          <div style={{ display: "flex", flexDirection: "row", overflow: "hidden" }}>
            {WORD.split("").map((ch, i) => {
              const t0 = 60 + i * 5;
              const o = ramp(frame, [t0, t0 + 10], [0, 1]);
              const x = ramp(frame, [t0, t0 + 12], [-40, 0], { easing: EASE.outQuint });
              return (
                <span
                  key={i}
                  style={{
                    fontSize: 128,
                    fontWeight: 700,
                    color: C.ink,
                    opacity: o * shift,
                    transform: `translateX(${x}px)`,
                    display: "inline-block",
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        </div>

        <div
          style={{
            fontSize: 36,
            color: C.brand,
            opacity: sloganIn,
            fontWeight: 500,
          }}
        >
          נבנה על ידי סטודנט לפכ״מ, לסטודנטים של פכ״מ
        </div>

        {/* הכתובת. `dir="ltr"` על ה-span עצמו ולא על השורה — היא לטינית
            טהורה, בלי מילה עברית לצידה, ולכן זה בטוח כאן. */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: C.ink,
            opacity: urlIn,
            transform: `translateY(${(1 - urlIn) * 14}px)`,
            letterSpacing: 0.5,
            direction: "ltr",
          }}
        >
          pakam-strategist.vercel.app
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 64,
            fontSize: 22,
            color: "rgba(24,24,27,0.6)",
            opacity: sloganIn,
          }}
        >
          לא קשור רשמית לאוניברסיטת תל אביב.
        </div>
      </div>
    </Stage>
  );
};
