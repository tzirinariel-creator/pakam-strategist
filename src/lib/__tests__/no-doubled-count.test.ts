import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// =========================================
// "5 5 ימים" — פעם שלישית, ולכן שומר סטטי
// =========================================
// `heNoun(5, "יום", "ימים")` מחזיר `"5 ימים"` — **עם** המספר. מי שכותב
//     <Bidi text={n} /> {heNoun(n, ...)}
// מדפיס אותו פעמיים. זה קרה ב-22.8 בעוזר המערכת ("3 3 ימים"), תוקן שם,
// וב-3.9 נמצא חי בשלושה מקומות נוספים:
//   · מסך הבידינג — "המקצה נפתח בעוד 5 5 ימים", ארבעה ימים לפני המקצה
//   · תוצאות סריקת גיליון הציונים — "7 7 קורסים עם ציון"
//   · אותו מסך — "ועוד 2 2 שעדיין בלימוד"
//
// בדיקת יחידה על `heNoun` לא יכולה לתפוס את זה: הפונקציה תקינה, ההצמדה
// שבורה. לכן הבדיקה קוראת את קבצי המקור. הצורה הנכונה היא להעביר את
// התוצאה **דרך** Bidi: `<Bidi text={heNoun(n, ...)} />`.

const SRC = join(process.cwd(), "src");
const COUNT_HELPERS = /heNoun|heNounF/;

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("מספר לא מודפס פעמיים", () => {
  const files = tsxFiles(SRC);

  it("יש בכלל מה לסרוק", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("אף <Bidi text={n}/> לא צמוד ל-heNoun(n) על אותו ביטוי", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      if (!COUNT_HELPERS.test(src)) continue;
      const lines = src.split("\n");

      for (let i = 0; i < lines.length; i++) {
        // הצמדה יכולה להתפרס על שתי שורות אחרי הרצת prettier, ולכן חלון
        // של שתי שורות ולא אחת.
        const window = `${lines[i]} ${lines[i + 1] ?? ""}`;
        const bidi = window.match(/<Bidi\s+text=\{([^}]+)\}\s*\/>/);
        if (!bidi) continue;
        const counted = window.match(/\bheNounF?\(\s*([^,]+),/);
        if (!counted) continue;

        const a = bidi[1]!.replace(/\s|String\(|\)/g, "");
        const b = counted[1]!.replace(/\s|String\(|\)/g, "");
        // אותו ביטוי בדיוק בשני הצדדים = המספר מודפס פעמיים.
        if (a && a === b) {
          offenders.push(`${file.replace(SRC, "src")}:${i + 1}  ${lines[i]!.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
