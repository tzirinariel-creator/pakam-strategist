/**
 * Ariel, 22.8: "מספר הפעמים שהערתי לך על שבירות עברית ומלל או על משפטים לא
 * קוהרנטיים היא לא נורמלית… אין מצב שאני מעיר לך על זה יותר. זה ברור?"
 *
 * It is. The previous guard only covered src/messages/*.json, and most of this
 * app's Hebrew is not there — it is inline in components. That gap is why the
 * same class kept reappearing after being "fixed": I was checking the smaller
 * half of the copy.
 *
 * This walks every .ts/.tsx file and reads the Hebrew string literals in them.
 * It is deliberately mechanical. Reading for these by eye is what failed.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const HEBREW = /[֐-׿]/;
/** Hebrew string literals, skipping comment lines. */
const STRING = /"([^"\n]*[֐-׿][^"\n]*)"|`([^`\n]*[֐-׿][^`\n]*)`/g;

function hebrewStrings(): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const rel = path.relative(process.cwd(), full);
      fs.readFileSync(full, "utf-8").split("\n").forEach((line, i) => {
        const t = line.trim();
        // Comments carry Hebrew explanations for developers, not for readers.
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (!HEBREW.test(line)) return;
        for (const m of line.matchAll(STRING)) {
          out.push({ file: rel, line: i + 1, text: m[1] ?? m[2] ?? "" });
        }
      });
    }
  };
  walk(path.join(process.cwd(), "src"));
  return out;
}

const STRINGS = hebrewStrings();

/** Real compound terms and units — a slash here is not a gender hedge. */
const REAL_SLASH =
  /עובר\/לא עובר|עובר\/לא־עובר|עובר\/לא-עובר|עובר\/נכשל|עובר\/לא|שעות\/שבוע|שע׳\/שבוע|ספאם\/קידום מכירות|פטור\/שנה|ש״ס\/קורסים|נכשלו\/פטור|אישי\/עבודה|ימים\/סמסטר|הגשות\/עבודות\/בחנים|דקאן\/רקטור|אנגלית\/אמירנט|המזכירות\/הידיעון|נכשלו\/פטור|עובר\/לא[-־]עובר/g;

describe("Hebrew copy, mechanically", () => {
  it("finds enough Hebrew to be a real check", () => {
    // If a refactor moves the copy elsewhere, this guard must fail loudly
    // rather than quietly pass over an empty set.
    expect(STRINGS.length).toBeGreaterThan(400);
  });

  it("has no slashed dual-gender forms", () => {
    // "בחר/י", "את/ה", "לוחם/ת" — what a form says, not a person. The neutral
    // form is what a reader with no declared gender sees, i.e. most of them.
    const bad = STRINGS.filter((s) => /[֐-׿]\/[֐-׿]/.test(s.text.replace(REAL_SLASH, "")));
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });

  it("never puts a bare placeholder in front of a counted noun", () => {
    // `${n} קורסים` renders "1 קורסים". Fixed units (ש״ס, שעות) do not inflate.
    const COUNTED = /\$\{[^}]+\}\s*(קורסים|ימים|סמסטרים|דברים|מבחנים|תרומות|מדרגים|נקודות)/;
    const bad = STRINGS.filter((s) => COUNTED.test(s.text));
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });

  it("uses gershayim, not a straight quote, inside a Hebrew word", () => {
    // פכ"מ vs פכ״מ. The straight quote is the typewriter form and reads wrong.
    const bad = STRINGS.filter((s) => /[֐-׿]"[֐-׿]/.test(s.text));
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });

  it("has no doubled spaces mid-sentence", () => {
    const bad = STRINGS.filter((s) => /[֐-׿] {2,}[֐-׿]/.test(s.text));
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });

  it("stays out of bureaucratic register", () => {
    const bad = STRINGS.filter((s) =>
      /יש לוודא|באחריות המשתמש|אין להסתמך|למען הסר ספק/.test(s.text),
    );
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });
});
