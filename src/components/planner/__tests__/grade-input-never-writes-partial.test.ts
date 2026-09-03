import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =========================================
// ציון חלקי אינו ציון
// =========================================
// שדה הציון בפופאובר "כבר השלמתי קורס זה" תיזמן כתיבה 600ms אחרי כל הקשה.
// סטודנט שהקליד "95" ועצר רגע אחרי ה-9 — להסתכל בגיליון, לענות להודעה —
// קיבל כתיבה אמיתית של ציון 9. תשע נמוך מרף המעבר, אז הקורס נשמר **נכשל**.
// "100" עשה את זה פעמיים בדרך: 1, ואז 10. אם הפופאובר נסגר באותו רגע, זה
// מה שנשאר במסד — קורס חובה שעבר, מסומן ככישלון, עם ציון 9.
//
// הבדיקה משחזרת את מכונת המצבים של השדה: הקלדה מעדכנת מקומית בלבד, ורק
// blur / Enter / יציאה כותבים — פעם אחת, עם הערך המלא.

type Write = { grade: number | null; status?: string };
const PASS = 60;

/** בדיוק החוזה של השדה אחרי התיקון. */
function makeField(onWrite: (w: Write) => void, initial = "") {
  let live = initial;
  let committed = initial;
  const commit = () => {
    if (live === committed) return;
    committed = live;
    if (live === "") return onWrite({ grade: null });
    const n = parseInt(live, 10);
    onWrite({ grade: n, status: n >= PASS ? "COMPLETED" : "FAILED" });
  };
  return {
    type(ch: string) {
      const next = live + ch;
      const n = parseInt(next, 10);
      if (isNaN(n) || n < 0 || n > 100) return;
      live = String(n);
    },
    clear() {
      live = "";
    },
    blur: commit,
    unmount: commit,
    get value() {
      return live;
    },
  };
}

describe("הקלדה לא כותבת", () => {
  let writes: Write[];
  beforeEach(() => {
    writes = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('הקלדת "95" עם עצירה באמצע לא כותבת 9', () => {
    const f = makeField((w) => writes.push(w));
    f.type("9");
    vi.advanceTimersByTime(5000); // הסטודנט עצר לחשוב
    expect(writes).toEqual([]); // ← כאן היה נכתב { grade: 9, status: "FAILED" }
    f.type("5");
    f.blur();
    expect(writes).toEqual([{ grade: 95, status: "COMPLETED" }]);
  });

  it('הקלדת "100" כותבת פעם אחת, לא שלוש', () => {
    const f = makeField((w) => writes.push(w));
    for (const ch of "100") {
      f.type(ch);
      vi.advanceTimersByTime(1000);
    }
    expect(writes).toEqual([]);
    f.blur();
    expect(writes).toEqual([{ grade: 100, status: "COMPLETED" }]);
  });

  it("יציאה בלי blur עדיין שומרת — סגירת פופאובר לא תמיד מייצרת blur", () => {
    const f = makeField((w) => writes.push(w));
    f.type("8");
    f.type("8");
    f.unmount();
    expect(writes).toEqual([{ grade: 88, status: "COMPLETED" }]);
  });

  it("ציון נכשל אמיתי עדיין נשמר ככישלון — התיקון לא בלע אותו", () => {
    const f = makeField((w) => writes.push(w));
    f.type("4");
    f.type("5");
    f.blur();
    expect(writes).toEqual([{ grade: 45, status: "FAILED" }]);
  });

  it("blur בלי שינוי לא כותב בכלל", () => {
    const f = makeField((w) => writes.push(w), "88");
    f.blur();
    expect(writes).toEqual([]);
  });

  it("מחיקת הציון מוחקת אותו ולא מסמנת כישלון", () => {
    const f = makeField((w) => writes.push(w), "88");
    f.clear();
    f.blur();
    expect(writes).toEqual([{ grade: null }]);
  });
});
