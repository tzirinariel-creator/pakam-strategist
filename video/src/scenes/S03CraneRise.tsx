import React from "react";
import { useCurrentFrame } from "remotion";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { PageShot } from "../ui/PageShot";

/**
 * ס׳3 · 150f · מסך הבית
 * כרטיס: crane-rise-reveal — קלוז־אפ 20f + עלייה 100f + סטילס 30f.
 *
 * צילום אמיתי מ-pakam-strategist.vercel.app (חשבון דמו). פותח צמוד על
 * הכותרת האישית — "היי יובל · פכ״מ · שנה ב׳" — ונסוג עד למסך המלא.
 *
 * עיקרון Q5: גיבור אחד לפתיחה. הגיבור כאן הוא הפנייה בשם.
 */

export const S03CraneRise: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = ramp(frame, [20, 120], [2.6, 1], { easing: EASE.outQuint });
  // המצלמה מתחילה על הכותרת (ימין־עליון ב-RTL) ונסוגה למרכז.
  const x = ramp(frame, [20, 120], [72, 50], { easing: EASE.outQuint });
  const y = ramp(frame, [20, 120], [16, 50], { easing: EASE.outQuint });

  return (
    <Stage>
      <PageShot src="dashboard.png" focus={{ x, y, scale }} />
      <Caption text="מקום אחד שיודע איפה אתם עומדים" at={124} />
    </Stage>
  );
};
