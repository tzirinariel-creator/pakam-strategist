// =========================================================================
// The copy sweep, pinned
// =========================================================================
// Ariel, 21.8: "בכללי אני מבקש ממך לעבור על כל ניסוח באתר ובדף נחיתה", and
// separately "לנסות פחות בוא/י וכאלו - שרוב היחס יהיה אישי ומותאם לשם ולמגדר".
//
// A one-off sweep decays. Every one of these classes was found by reading the
// strings once, fixed, and then came straight back the next time someone added
// a key — "1 קורסים" alone has been fixed three times. So the sweep lives here
// instead: it runs over the real message catalogs on every `vitest run`, and a
// regression fails the build rather than reaching a student's screen.

import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

type Json = { [k: string]: string | Json };

function flatten(obj: Json, prefix = ""): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? [[path, v] as [string, string]] : flatten(v, path);
  });
}

const HE = flatten(he as unknown as Json);
const EN = flatten(en as unknown as Json);

describe("Hebrew copy audit", () => {
  it("has no slashed dual-gender forms", () => {
    // "בוא/י", "עומד/ת", "את/ה" — what a government form says, not a person.
    // Real compound terms with a slash are allowed by name: they are units and
    // proper terms, not a hedge about who is reading.
    const ALLOWED = /עובר\/לא עובר|שעות\/שבוע|ספאם\/קידום מכירות|פטור\/שנה/;
    const bad = HE.filter(([, v]) => {
      const stripped = v.replace(new RegExp(ALLOWED, "g"), "");
      return /[֐-׿]\/[֐-׿]/.test(stripped);
    });
    expect(bad.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it("never puts a raw placeholder in front of a counted noun", () => {
    // Hebrew's number agreement breaks at one, so "{count} קורסים" renders
    // "1 קורסים". The fix is ICU plural, which next-intl already resolves.
    // Fixed units are exempt: ש״ס and שעות do not inflect after a numeral.
    const COUNTED = /\{(\w+)\}\s*(קורסים|סמסטרים|דברים|הודעות|בחינות|מטלות|נקודות)/;
    const bad = HE.filter(([, v]) => COUNTED.test(v) && !v.includes("plural,"));
    expect(bad.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it("uses the project's terminology", () => {
    // CLAUDE.md: ש״ס with gershayim, never נ"ז; "תחום מיקוד", never "התמחות".
    const bad = HE.filter(([, v]) => /נ["״]ז|ש"ס|התמחו(ת|יות)/.test(v));
    expect(bad.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it("does not fall back into bureaucratic register", () => {
    // Ariel on the old disclaimer: "אתה שם לב שהוא לא כזה אנושי".
    const bad = HE.filter(([, v]) =>
      /יש לוודא|יש לבדוק|באחריות המשתמש|אין להסתמך|למען הסר ספק|יש להתייעץ/.test(v),
    );
    expect(bad.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it("keeps he and en key-for-key identical", () => {
    // A key present in one locale only renders as its own raw path on screen.
    const h = new Set(HE.map(([k]) => k));
    const e = new Set(EN.map(([k]) => k));
    expect([...h].filter((k) => !e.has(k))).toEqual([]);
    expect([...e].filter((k) => !h.has(k))).toEqual([]);
  });

  it("keeps every placeholder in he present in en", () => {
    // A dropped {count} in one locale is a silently blank number, not a crash.
    // Only real ICU arguments: a name followed by `}` or `,`. Without the
    // trailing check this also captured plural sub-message bodies — `{1 course}`
    // in en reads as an argument named "1" and every plural key looks broken.
    const ph = (s: string) =>
      [...s.matchAll(/\{(\w+)\s*[},]/g)].map((m) => m[1]!).sort();
    const enMap = new Map(EN);
    const bad = HE.filter(([k, v]) => {
      const other = enMap.get(k);
      return other !== undefined && ph(v).join() !== ph(other).join();
    });
    expect(bad.map(([k]) => k)).toEqual([]);
  });
});
