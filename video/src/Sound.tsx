import React from "react";
import { Audio, Sequence, staticFile } from "remotion";

/**
 * שכבת הצליל.
 *
 * הסרטון רץ עד עכשיו בלי אף צליל, ובסקיל הקול אינו קישוט — כלל S4 אומר
 * "פוליי לפני קישוט: לכל פעולה בתמונה הצליל של אותה פעולה, חתוך לאורך
 * הפעולה". כלל S2 אומר לתקוע כל אפקט על פריים, לא 'בערך שם'.
 *
 * **כלל R4 הוא המגביל:** אימפקט ברמת המסך המלא — כזה שמרגיש כמו מכה על כל
 * הפריים — מותר **עד שלוש פעמים בסרט כולו**. כאן: נחיתת הגיבור (S01),
 * רגע הכנות (S07) ונעילת הסיום (S11). כל שאר הצלילים פועלים על שכבת
 * האלמנט בלבד ובעוצמה נמוכה.
 *
 * העיתוי בפריימים מוחלטים של הסרט; אם משכי הסצנות משתנים, הטבלה הזאת
 * חייבת להיכתב מחדש (S3: "הקול נעשה אחרי שהתמונה ננעלה").
 */

type Cue = {
  /** פריים מוחלט בסרט */
  at: number;
  file: string;
  volume: number;
  /** האם זה אימפקט ברמת מסך מלא — נספר מול תקציב R4 */
  slam?: boolean;
  why: string;
};

export const CUES: Cue[] = [
  // ── S01 · הפתיחה (0–138)
  { at: 6, file: "whoosh-quick.mp3", volume: 0.22, why: "הספוט מתחיל לנוע" },
  { at: 32, file: "click.mp3", volume: 0.3, why: "נעילת הספוט על הגיבור" },
  { at: 48, file: "whoosh.mp3", volume: 0.45, why: "הכרטיס מתרומם" },
  { at: 66, file: "sparkle.mp3", volume: 0.3, why: "אלומת המתאר, הקפה ראשונה" },
  { at: 128, file: "impact-big.mp3", volume: 0.5, slam: true, why: "SLAM 1/3 — הכרטיס נוחת" },

  // ── S02 · המותג (139–221)
  { at: 153, file: "type.mp3", volume: 0.18, why: "חתימת האותיות" },

  // ── S03 · מסך הבית (222–371) — עלייה רציפה, בלי מכה
  { at: 242, file: "whoosh.mp3", volume: 0.2, why: "המצלמה מתחילה לעלות" },

  // ── S04 · המתכנן (372–449) — פסגת הקצב
  { at: 366, file: "riser.mp3", volume: 0.34, why: "ריזר לתוך פסגת הקצב" },
  { at: 378, file: "whoosh-quick.mp3", volume: 0.3, why: "הקלפים נכנסים" },

  // ── S05 · הקטלוג (450–524)
  { at: 458, file: "type.mp3", volume: 0.2, why: "הקלדה בחיפוש" },

  // ── S06 · מערכת השעות (525–584)
  { at: 528, file: "whoosh-quick.mp3", volume: 0.22, why: "הרשת נוחתת" },

  // ── S07 · ביט הכנות (585–716)
  { at: 596, file: "scan.mp3", volume: 0.26, why: "הקווקו מתפוגג לנתון" },
  { at: 660, file: "impact-big.mp3", volume: 0.42, slam: true, why: "SLAM 2/3 — הנתון האמיתי" },

  // ── S08 · המלך (717–866)
  { at: 722, file: "scan.mp3", volume: 0.22, why: "התשובה מתחילה לזרום" },
  { at: 760, file: "click.mp3", volume: 0.2, why: "המסקנה נוחתת" },

  // ── S09 · הבידול (867–941)
  { at: 893, file: "sparkle.mp3", volume: 0.22, why: "קו המרקר" },

  // ── S10 · המספרים (942–1091)
  { at: 968, file: "counter.mp3", volume: 0.3, why: "גלגול הספרות" },

  // ── S11 · הסיום (1092–1223)
  { at: 1092, file: "riser.mp3", volume: 0.4, why: "ריזר לתוך הסיום" },
  { at: 1128, file: "impact-big.mp3", volume: 0.55, slam: true, why: "SLAM 3/3 — נעילת המותג" },
  { at: 1150, file: "sparkle.mp3", volume: 0.26, why: "הסלוגן" },
];

// אכיפה בזמן בנייה: אם מישהו יוסיף slam רביעי, הרנדר ייפול ולא ישקר.
const SLAMS = CUES.filter((c) => c.slam).length;
if (SLAMS > 3) {
  throw new Error(
    `aesthetic-rules R4: מותרים עד 3 אימפקטים ברמת מסך מלא בסרט, יש ${SLAMS}.`,
  );
}

export const SoundBed: React.FC = () => (
  <>
    {CUES.map((c, i) => (
      <Sequence key={i} from={c.at} name={`sfx:${c.file}@${c.at}`}>
        <Audio src={staticFile(`sfx/${c.file}`)} volume={c.volume} />
      </Sequence>
    ))}
  </>
);
