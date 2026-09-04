// =========================================================================
// מחלקת Tailwind עם שני מְשַׁנֵּי־שקיפות אינה מחלקה
// =========================================================================
// נמצא ב-4.9 תוך כדי אודיט העיצוב: `text-status-red/90/90`,
// `text-status-amber/80/70` ועוד שלושה. Tailwind לא מפרסר אותן, כלומר
// המחלקה **נושרת** והאלמנט יורש את צבע האב. חמישה מהם ישבו על טקסט
// שנושא אזהרה — בדיוק המקום שבו הצבע הוא המסר.
//
// זו טעות שקטה: אין שגיאת בנייה, אין שגיאת טיפוסים, והמסך נראה סביר.
// היא נתפסת רק במדידת ניגודיות או בבדיקה כמו זו.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { if (entry !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

describe("מחלקות Tailwind", () => {
  it("אין מחלקה עם שני מְשַׁנֵּי־שקיפות", () => {
    // `text-foo/50/50` — Tailwind מפיל אותה, והצבע מגיע מהאב.
    const DOUBLE = /\b(?:text|bg|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|divide|accent|caret|placeholder)-[a-z0-9-[\]().,%]+\/\d{1,3}\/\d{1,3}\b/;
    const bad: string[] = [];
    // הקובץ הזה עצמו מצטט את הדפוס בהערות ובדוגמה — מדלגים עליו.
    const SELF = "tailwind-opacity-guard.test.ts";
    for (const file of walk(join(process.cwd(), "src"))) {
      if (file.endsWith(SELF)) continue;
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        const m = DOUBLE.exec(line);
        if (m) bad.push(`${file.replace(process.cwd() + "/", "")}:${i + 1} — ${m[0]}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
