"use client";

// =========================================================================
// The exam planner's first-visit introduction (#4, 13.8).
//
// Everything stated here is checked against src/lib/xlsx-export.ts:
//   • three sheets — "לוח שבועי" (183), "תוכנית" (292), "אג'נדה" (389);
//   • study cells tinted by intensity, exam day solid, weekends shaded;
//   • the agenda carries a ☐ column to tick off (429).
// No adjectives the file can't back up, and no exclamation marks.
// =========================================================================

import { Table2 } from "lucide-react";
import { FirstVisitIntro } from "@/components/ui/first-visit-intro";

/** A miniature of the exported weekly grid — same idea as the real sheet:
 *  one column per day, tint deepening with study hours, exam day solid. */
function GridPreview({ isHe }: { isHe: boolean }) {
  const days = isHe ? ["א", "ב", "ג", "ד", "ה", "ו"] : ["S", "M", "T", "W", "T", "F"];
  // rows = courses, values = study intensity 0..3, 9 = the exam itself.
  const rows: { hue: string; cells: number[] }[] = [
    { hue: "16 185 129", cells: [1, 2, 2, 3, 9, 0] },
    { hue: "99 102 241", cells: [0, 1, 1, 2, 3, 9] },
    { hue: "245 158 11", cells: [2, 1, 0, 1, 1, 2] },
  ];
  // No dir override: the grid follows the page, so in Hebrew the week starts
  // on the right (א rightmost) and the cells stay under their own headers.
  return (
    <div className="w-fit rounded-lg border border-border/50 bg-foreground/[0.02] p-2">
      <div className="mb-1 grid grid-cols-6 gap-0.5">
        {days.map((d, i) => (
          <span key={i} className="w-6 text-center text-[9px] font-medium text-foreground/35">
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {rows.map((r, ri) => (
          <div key={ri} className="grid grid-cols-6 gap-0.5">
            {r.cells.map((v, ci) => (
              <span
                key={ci}
                className="h-3.5 w-6 rounded-[2px]"
                style={{
                  backgroundColor:
                    v === 9
                      ? "rgb(239 68 68)"
                      : v === 0
                        ? "rgb(128 128 128 / 0.12)"
                        : `rgb(${r.hue} / ${0.18 + v * 0.22})`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function XlsxIntro({ isHe }: { isHe: boolean }) {
  return (
    <FirstVisitIntro
      storageKey="exam-planner-xlsx"
      icon={<Table2 className="size-4.5" />}
      title={isHe ? "מה שתבנו כאן יוצא גם כקובץ אקסל" : "What you build here also exports to Excel"}
      body={
        isHe
          ? "אחרי שתבנו תוכנית, כפתור השיתוף מוריד .xlsx בשלושה גיליונות: לוח שבועי שבו כל תא נצבע לפי כמות שעות הלימוד ויום המבחן מסומן, טבלת מבחנים עם תאריכים ושעות מתוכננות, ואג'נדה להדפסה עם תיבות לסימון. אפשר גם קובץ יומן (.ics)."
          : "Once you build a plan, the share button downloads an .xlsx with three sheets: a weekly grid where each cell is tinted by study hours and the exam day is marked, an exam table with dates and budgeted hours, and a printable agenda with tick-boxes. A calendar file (.ics) is there too."
      }
      preview={<GridPreview isHe={isHe} />}
    />
  );
}
