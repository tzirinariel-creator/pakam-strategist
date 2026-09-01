import React from "react";
import { useCurrentFrame } from "remotion";
import { EASE, ramp } from "../lib/anim";
import { Caption, Stage } from "../ui/Kit";
import { PageShot } from "../ui/PageShot";

/**
 * ס׳5 · 75f · הקטלוג
 * כרטיס: type-and-filter — המצלמה חודרת מהרשת אל הפריט.
 * כלל R3: קצב של אדם אמיתי, לא של מכונה.
 *
 * צילום אמיתי של /he/catalog.
 * 304 = CATALOG_COURSE_COUNT (`src/lib/constants.ts`), נעול ב-vitest.
 */

export const S05TypeFilter: React.FC = () => {
  const frame = useCurrentFrame();
  const push = ramp(frame, [10, 62], [1, 1.9], { easing: EASE.outQuint });
  const y = ramp(frame, [10, 62], [42, 56], { easing: EASE.outQuint });

  return (
    <Stage>
      <PageShot src="catalog.png" focus={{ x: 50, y, scale: push }} />
      <Caption text="304 קורסים. דרישות קדם כלולות." at={50} />
    </Stage>
  );
};
