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
/**
 * Hebrew string literals, skipping comment lines.
 *
 * The BACKTICK alternative has to come first, and that ordering is the whole
 * correctness of this file. With the quoted alternative first, a line like
 *
 *   `${heNoun(n, "סמסטר", "סמסטרים")} שנקלטו … לא נספרים`
 *
 * matched "סמסטר" and then "סמסטרים" — two harmless nouns — and the outer
 * template, which is where the broken sentence actually lives, was never
 * extracted at all. Every heNoun call passes its forms as quoted strings, so
 * the guard was blind over precisely the construct it exists to police.
 */
const STRING = /`([^`\n]*[֐-׿][^`\n]*)`|"([^"\n]*[֐-׿][^"\n]*)"/g;

function hebrewStrings(): { file: string; line: number; text: string; context: string }[] {
  const out: { file: string; line: number; text: string; context: string }[] = [];
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
      const lines = fs.readFileSync(full, "utf-8").split("\n");
      lines.forEach((line, i) => {
        const t = line.trim();
        // Comments carry Hebrew explanations for developers, not for readers.
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (!HEBREW.test(line)) return;
        // The three lines above travel with the string: whether a count is
        // branched on `=== 1` is decided there, not inside the literal.
        const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        for (const m of line.matchAll(STRING)) {
          out.push({ file: rel, line: i + 1, text: m[1] ?? m[2] ?? "", context });
        }
      });
    }
  };
  walk(path.join(process.cwd(), "src"));
  return out;
}

const STRINGS = hebrewStrings();

/** Every source file, for rules that read markup rather than string contents. */
function sourceFiles(): { file: string; lines: string[] }[] {
  const out: { file: string; lines: string[] }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      out.push({
        file: path.relative(process.cwd(), full),
        lines: fs.readFileSync(full, "utf-8").split("\n"),
      });
    }
  };
  walk(path.join(process.cwd(), "src"));
  return out;
}

/** Real compound terms and units — a slash here is not a gender hedge. */
const REAL_SLASH =
  /עובר\/לא עובר|עובר\/לא־עובר|עובר\/לא-עובר|עובר\/נכשל|עובר\/לא|שעות\/שבוע|שע׳\/שבוע|ספאם\/קידום מכירות|פטור\/שנה|ש״ס\/קורסים|נכשלו\/פטור|אישי\/עבודה|ימים\/סמסטר|הגשות\/עבודות\/בחנים|דקאן\/רקטור|אנגלית\/אמירנט|אמירם\/פסיכומטרי|המזכירות\/הידיעון|נכשלו\/פטור|עובר\/לא[-־]עובר/g;

/**
 * Is this string the PLURAL ARM of a branch that already handles one?
 *
 * `${n} קורסים` is wrong on its own and right inside `n === 1 ? … : …`. The
 * literal cannot tell you which, because the guard lives three lines up. Both
 * counting rules below consult this, or they would fire on every correctly
 * written ternary in the app — and a guard that cries wolf gets muted, which
 * costs more than the bug it was added for.
 */
const isPluralArm = (context: string) =>
  /===\s*1|length\s*>\s*1|heCount\(|countPhrase\(/.test(context);

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
    // W3 — "1 קורסים" בכפתור הסיום. סרקתי את כל הקוד: 79 מ-80 המועמדים הם
    // ש״ס (יחידה קבועה שלא מוטה), ושלושה היו אמיתיים. שניים תוקנו ב-4.9
    // ("1 מטלות מחכות שם", "ועוד 1 חפיפות") ושמותיהם נוספו כאן, כדי
    // שהמשפחה הזאת לא תחזור דרך ניסוח חדש.
    const COUNTED = /\$\{[^}]+\}\s*(קורסים|ימים|סמסטרים|דברים|מבחנים|תרומות|מדרגים|נקודות|מטלות|חפיפות|שאלות|הערות|תוכניות|קבוצות)/;
    const bad = STRINGS.filter((s) => COUNTED.test(s.text) && !isPluralArm(s.context));
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });

  it("does not leave a plural verb hanging off a heNoun call", () => {
    // The fifth occurrence of this exact class, and the reason the rule now
    // exists mechanically rather than as a habit:
    //
    //   heNoun(n, "סמסטר", "סמסטרים") + " שנקלטו … לא נספרים"
    //   → at one: "סמסטר אחד שנקלטו מלפני תחילת התואר — לא נספר\u05d9\u05dd"
    //
    // heNoun fixes the NOUN. Every verb and adjective agreeing with that noun
    // is still written once, in the plural, by whoever wrote the line — and
    // he-count.ts says so in its own header ("the singular is usually a
    // different sentence, not the plural with a letter removed"). The helper
    // cannot reach past its own return value, so the check has to.
    //
    // Curated rather than morphological: a general Hebrew plural-verb detector
    // would fire on every correct plural in the app. These are the words that
    // have actually shipped broken.
    const PLURAL_TAIL =
      // No `\b` here, deliberately. JavaScript's word boundary is defined on
      // [A-Za-z0-9_], so a Hebrew letter is a NON-word character on both sides
      // and `\b` after "נספרים" can never match. The first version of this rule
      // carried one and was therefore inert — it passed on the exact line it
      // was written to catch, which is the worst way for a guard to fail.
      /נספרים|נספרו|נקלטו|שנקלטו|נצברו|מסומנות|מסומנים|נבחרו|נמצאים|נמצאות|הושלמו|מתוכננים|מתוכננות|זמינים|זמינות|חסרים|חסרות|שדווחו|שבוצעו|שנותרו|פתוחים|פתוחות/;
    // Positional, not merely co-occurring: the plural word has to follow the
    // heNoun call with NOTHING BRANCHED in between. A line that correctly
    // branches its verb puts that verb inside its own `${…}`, so the plain
    // text right after the count is where an unbranched plural hides.
    const bad = STRINGS.filter((s) => {
      // A plural verb is CORRECT in the plural arm of a branch that already
      // handles one. Without this the rule fires on every properly written
      // ternary and gets muted — which is how a guard stops being read.
      if (isPluralArm(s.context)) return false;
      for (const m of s.text.matchAll(/heNounF?\([^)]*\)\s*\}/g)) {
        const after = s.text.slice(m.index + m[0].length);
        const untilNextBranch = after.split("${")[0] ?? "";
        if (PLURAL_TAIL.test(untilNextBranch)) return true;
      }
      return false;
    });
    expect(bad.map((b) => `${b.file}:${b.line} — ${b.text}`)).toEqual([]);
  });

  it("keeps a unit or separator inside the number's isolate", () => {
    // `<Bidi text={pct} />% מהממוצע` renders "%8.6" — the % is a bidi-neutral
    // sitting between an isolate and Hebrew text, so it resolves right-to-left
    // and lands on the wrong side of the digits. Seen on the live page.
    // The unit belongs INSIDE the isolate: <Bidi text={`${pct}%`} />.
    const files = sourceFiles();
    const bad: string[] = [];
    for (const { file, lines } of files) {
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*")) return;
        // A trailing unit OR a bare separator between two isolated numbers.
        // Both are neutrals: inside an RTL paragraph they resolve
        // right-to-left and land on the wrong side, or scramble the run.
        //   <Bidi text={pct} />%           → "%8.6"
        //   <Bidi text={g} />{"/100 · "}   → the grade line, laid out backwards
        if (/<Bidi[^>]*\/>\s*(?:[%₪°]|\{"\s*[/·×–-])/.test(line)) {
          bad.push(`${file}:${i + 1} — ${t}`);
        }
      });
    }
    expect(bad).toEqual([]);
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
