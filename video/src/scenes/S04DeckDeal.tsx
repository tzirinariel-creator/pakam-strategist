import React from "react";
import { useCurrentFrame } from "remotion";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { PageShot } from "../ui/PageShot";

/**
 * ס׳4 · 78f · המתכנן
 * כרטיס: deck-deal-flyin — אנרגיה גבוהה, פסגת הקצב.
 *
 * צילום אמיתי של /he/planner. "חלוקת קלפים" אי אפשר לעשות על צילום שטוח,
 * אז נשמרת שפת התנועה של הכרטיס: האצה חדה, מעקב מצלמה, וחצי שנייה עצירה
 * כשהלוח מלא (כלל R2). ⚠️ RTL: התנועה נכנסת מימין, לא משמאל.
 */

export const S04DeckDeal: React.FC = () => {
  const frame = useCurrentFrame();
  const p = ramp(frame, [0, 46], [0, 1], { easing: EASE.outQuint });
  const x = 50 + (1 - p) * 26; // מגיע מימין
  const scale = 1.55 - 0.45 * p;

  return (
    <Stage>
      <PageShot src="planner.png" focus={{ x, y: 46, scale }} />
      <Caption text="כל הקורסים, מסודרים לפי סמסטרים" at={52} />
    </Stage>
  );
};
