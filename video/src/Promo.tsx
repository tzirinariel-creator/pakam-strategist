import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import { C } from "./theme";
import { S01Converge } from "./scenes/S01Converge";
import { S02BrandInk } from "./scenes/S02BrandInk";
import { S03CraneRise } from "./scenes/S03CraneRise";
import { S04DeckDeal } from "./scenes/S04DeckDeal";
import { S05TypeFilter } from "./scenes/S05TypeFilter";
import { S06RowEmbed } from "./scenes/S06RowEmbed";
import { S07HatchDepth } from "./scenes/S07HatchDepth";
import { S08KingStream } from "./scenes/S08KingStream";
import { S09MarkerTitle } from "./scenes/S09MarkerTitle";
import { S10Odometer } from "./scenes/S10Odometer";
import { S11Lockup } from "./scenes/S11Lockup";

/**
 * לוח הזמנים. משכי הסצנות נלקחו מהמשכים המתועדים של כרטיסי הסקיל —
 * לא נקבעו בעין. שינוי משך = לחזור לכרטיס ולבדוק שהוא עדיין עומד
 * בכללי R1/R2 (hold של שנייה, 0.5s עצירה אחרי תנועה קבוצתית).
 */
export const SHOTS = [
  { id: "S01", card: "bezier-source-converge-merge", frames: 168, Comp: S01Converge },
  { id: "S02", card: "brand-ink-open", frames: 83, Comp: S02BrandInk },
  { id: "S03", card: "crane-rise-reveal", frames: 150, Comp: S03CraneRise },
  { id: "S04", card: "deck-deal-flyin", frames: 78, Comp: S04DeckDeal },
  { id: "S05", card: "type-and-filter", frames: 75, Comp: S05TypeFilter },
  { id: "S06", card: "row-embed", frames: 60, Comp: S06RowEmbed },
  { id: "S07", card: "hatch-depth", frames: 132, Comp: S07HatchDepth },
  { id: "S08", card: "ai-stream-response", frames: 150, Comp: S08KingStream },
  { id: "S09", card: "marker-underline-title", frames: 75, Comp: S09MarkerTitle },
  { id: "S10", card: "odometer-digit-roll", frames: 150, Comp: S10Odometer },
  { id: "S11", card: "logo-shrink-wordmark-lockup", frames: 132, Comp: S11Lockup },
] as const;

export const TOTAL_FRAMES = SHOTS.reduce((n, s) => n + s.frames, 0); // 1253 ≈ 41.8s

export type PromoProps = {
  /** הסקיל דורש שתי גרסאות: עם מוזיקה ובלעדיה (SFX נשמר). */
  bgm?: boolean;
};

export const Promo: React.FC<PromoProps> = ({ bgm = false }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SHOTS.map(({ id, frames, Comp }) => {
        const from = at;
        at += frames;
        return (
          <Sequence key={id} from={from} durationInFrames={frames} name={id}>
            <Comp />
          </Sequence>
        );
      })}

      {/* המוזיקה מושבתת כברירת מחדל — ספריית ה-BGM של הסקיל היא היפ-הופ/האוס
          ואינה תואמת את הטון של המוצר. ראו README. */}
      {bgm ? <Audio src={staticFile("bgm.mp3")} volume={0.35} /> : null}
    </AbsoluteFill>
  );
};
