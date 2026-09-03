import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, FONT, HE } from "../theme";
import { Stage } from "../ui/Kit";
import { HeroLift, OutlineBeam, VacatedSlot } from "../ui/HeroLift";
import layout from "../../public/shots/layout.json";

/**
 * ס׳1 · 139f · הפתיחה
 * כרטיס: spotlight-hero-card (opening)
 *
 * הגרסה הקודמת פתחה בארבעה כרטיסים שמתכנסים. הכרטיס אומר על זה במפורש:
 * "פתיחה עם ריקוד רב־כרטיסים לא מחזיקה רושם ראשוני (Q5) — הפתיחה נהרסה
 * שוב ושוב עד שהתכנסה לכרטיס יחיד; התחילו ישר מגיבור אחד עם קשת שלמה."
 *
 * הגיבור כאן הוא **עמודת סמסטר במתכנן** — היחידה האטומית של פכמון. אחד
 * מששת המלבנים שמהם בנוי תואר. הקואורדינטות שלו נמדדו מהעמוד החי
 * ב-`npm run shoot` ויושבות ב-layout.json; הן לא הוקלדו בעין.
 *
 * הקשת: ספוט נודד → נעילה → דחיפה אלכסונית → הרמה עם over-shoot →
 * ריחוף עם bob → אלומת מתאר בשתי הקפות → חזרה למקום עם לחיצה קלה.
 * נעילה→נחיתה ≈ 98f ≈ 3.3s, כי כלל R3 אומר שמראה־איכות חייב 3 שניות.
 */

export const S01_DURATION = 139;

const PLANNER = layout.planner.boxes[0];
const BOX = { x: PLANNER.x, y: PLANNER.y, w: PLANNER.w, h: PLANNER.h };
const CX = BOX.x + BOX.w / 2;
const CY = BOX.y + BOX.h / 2;

const PUSH = Easing.bezier(0.35, 0, 0.2, 1);
const POP = Easing.bezier(0.2, 1.25, 0.3, 1);
const RESEAT = Easing.bezier(0.4, 0, 0.3, 1.05);
const SPOT = Easing.bezier(0.4, 0, 0.3, 1);

const ip = (f: number, r: number[], o: number[], e = SPOT) =>
  interpolate(f, r, o, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

export const S01Hero: React.FC = () => {
  const frame = useCurrentFrame();

  // ── מצלמה: עמוד מלא ישר (0–32) → 16f דחיפה אלכסונית → נעילה מוחלטת.
  // rotY שולט, rotX רק 8° — מכסת צד קריאה יותר מצילום מלמעלה (Q6).
  const zoom = ip(frame, [32, 48], [0.78, 1.42], PUSH);
  const rotY = ip(frame, [32, 48], [0, 22], PUSH);
  const rotX = ip(frame, [32, 48], [0, 6], PUSH);
  const rotZ = ip(frame, [32, 48], [0, 1.2], PUSH);
  // מוקד מעט משמאל למרכז הכרטיס, כדי שהוא ינחת מעט ימינה מהמרכז
  const camX = ip(frame, [32, 48], [960, CX - 30], PUSH);
  const camY = ip(frame, [32, 48], [540, CY], PUSH);

  // ── ספוט נודד: 4 תחנות ואז נעילה. ישר אל המטרה נקרא כתוכנה, לא כחיפוש.
  const spotX = ip(frame, [4, 8, 16, 22, 28, 48], [25, 25, 70, 42, 55, 50]);
  const spotY = ip(frame, [4, 8, 16, 22, 28, 48], [30, 30, 45, 60, 60, 46]);
  const spotOn = ip(frame, [2, 10], [0, 1]);
  const poolBase = ip(frame, [22, 32, 48], [620, 420, 360]);
  const pulse = ip(frame, [32, 36, 41], [0, 0.06, 0]);
  const poolRx = poolBase * (1 + pulse);
  const poolRy = poolBase * 0.8 * (1 + pulse);
  const vignette = ip(frame, [22, 32, 48], [0.16, 0.34, 0.42]);

  // ── קשת הגיבור
  const rise = ip(frame, [48, 58], [0, 1], POP);
  const reseat = ip(frame, [112, 130], [0, 1], RESEAT);
  const lift = rise * (1 - reseat);
  const bob = Math.sin(((frame - 58) / 40) * Math.PI * 2) * 4 * lift;
  const z = 110 * lift + bob;
  const press = interpolate(frame, [126, 129, 130], [1, 0.997, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // ── אלומת המתאר: הקפה מהירה ובהירה, ואז איטית וחלשה
  const lap1 = ip(frame, [66, 82], [0, 1], Easing.linear);
  const lap2 = ip(frame, [88, 110], [0, 1], Easing.linear);

  const slotVis = Math.min(1, rise * 2) * (1 - reseat);
  const landPulse = ip(frame, [126, 130, 134], [0, 1, 0], Easing.linear);

  // ── הכיתוב מופיע רק אחרי שהכרטיס נח. מידע נוחת, ואז נושמים (R1).
  const capIn = ip(frame, [132, 139], [0, 1]);

  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: 1200,
          perspectiveOrigin: "50% 50%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 1920,
            height: 1080,
            transformStyle: "preserve-3d",
            transform:
              `translate(${960 - camX}px, ${540 - camY}px) ` +
              `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`,
            transformOrigin: `${camX}px ${camY}px`,
          }}
        >
          {/* העמוד */}
          <Img
            src={staticFile("shots/planner.png")}
            style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}
          />

          <VacatedSlot
            box={BOX}
            visible={slotVis}
            landPulse={landPulse}
            accent={C.brand}
            patch={C.bgSecondary}
          />

          <HeroLift src="planner.png" box={BOX} lift={lift} z={z} press={press} />

          <OutlineBeam box={BOX} z={z} lap1={lap1} lap2={lap2} color={C.brand} />
        </div>
      </div>

      {/* ספוט + vignette — במרחב המסך, מעל המצלמה */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: spotOn,
          background:
            `radial-gradient(${poolRx}px ${poolRy}px at ${spotX}% ${spotY}%,` +
            ` rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(10,10,20,${vignette}) 100%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          bottom: 92,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: capIn,
          ...HE,
        }}
      >
        <div style={{ fontSize: 58, fontWeight: 700, color: C.ink, fontFamily: FONT.body }}>
          סמסטר אחד מתוך שישה
        </div>
      </div>
    </Stage>
  );
};
