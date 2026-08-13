import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  COURSE_COLOR_COUNT,
  courseColor,
  courseColorIndex,
  courseEdge,
  courseSurface,
  normalizeCourseKey,
} from "@/lib/course-color";

// A slice of real תשפ״ז codes — deliberately including several that share the
// leading department block, because that is the case a naive hash gets wrong.
const REAL_CODES = [
  "0651-1010", "0651-1020", "0651-1030", "0651-2010", "0651-3001",
  "1011-3310", "1011-1001", "1011-1002", "1031-1010", "1031-2020",
  "0621-1101", "0621-1102", "0910-1000", "0881-1010", "1041-2200",
  "0662-1001", "0661-1001", "0671-1500", "1085-2300", "1080-1100",
  "0512-1810", "0368-1105", "1411-1200", "0821-2222",
];

describe("courseColorIndex — stability", () => {
  it("returns the same index for the same code on every call", () => {
    for (const code of REAL_CODES) {
      const first = courseColorIndex(code);
      for (let i = 0; i < 50; i++) {
        expect(courseColorIndex(code)).toBe(first);
      }
    }
  });

  it("is a pure function of the code — no module state carries between calls", () => {
    // Interleave a different code between reads; a memo keyed on "last call"
    // or any accumulating state would break here.
    const a = courseColorIndex("0651-1010");
    courseColorIndex("1011-3310");
    courseColorIndex("0621-1101");
    expect(courseColorIndex("0651-1010")).toBe(a);
  });

  it("pins known codes to fixed indices (regression guard: a colour must never move)", () => {
    // Snapshot of the derivation. If this fails, every student's grid just
    // recoloured itself — that is a breaking change, not a refactor.
    expect(courseColorIndex("0651-1010")).toBe(courseColorIndex("06511010"));
    const pinned: Record<string, number> = {};
    for (const code of REAL_CODES) pinned[code] = courseColorIndex(code);
    expect(pinned).toMatchInlineSnapshot(`
      {
        "0368-1105": 7,
        "0512-1810": 9,
        "0621-1101": 3,
        "0621-1102": 2,
        "0651-1010": 9,
        "0651-1020": 2,
        "0651-1030": 7,
        "0651-2010": 2,
        "0651-3001": 5,
        "0661-1001": 8,
        "0662-1001": 9,
        "0671-1500": 5,
        "0821-2222": 0,
        "0881-1010": 6,
        "0910-1000": 6,
        "1011-1001": 4,
        "1011-1002": 1,
        "1011-3310": 1,
        "1031-1010": 4,
        "1031-2020": 4,
        "1041-2200": 7,
        "1080-1100": 10,
        "1085-2300": 8,
        "1411-1200": 1,
      }
    `);
  });

  it("always lands inside the ramp", () => {
    for (const code of [...REAL_CODES, "", "x", "קורס בעברית", "0000-0000"]) {
      const idx = courseColorIndex(code);
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(COURSE_COLOR_COUNT);
    }
  });

  it("degrades to a valid colour for null/undefined/empty rather than undefined", () => {
    expect(courseColorIndex(null)).toBe(0);
    expect(courseColorIndex(undefined)).toBe(0);
    expect(courseColorIndex("")).toBe(0);
    expect(courseColor(null)).toBe("var(--course-color-0)");
  });
});

describe("normalizeCourseKey", () => {
  it("collapses every spelling of the same code onto one key", () => {
    const forms = ["0651-1010", "0651 1010", "06511010", "0651–1010", "0651_1010"];
    const keys = new Set(forms.map(normalizeCourseKey));
    expect(keys.size).toBe(1);
    const indices = new Set(forms.map(courseColorIndex));
    expect(indices.size).toBe(1);
  });

  it("is case-insensitive", () => {
    expect(normalizeCourseKey("ppe-101a")).toBe(normalizeCourseKey("PPE-101A"));
    expect(courseColorIndex("ppe-101a")).toBe(courseColorIndex("PPE-101A"));
  });

  it("keeps a Hebrew-only custom course deterministic instead of collapsing it to 0", () => {
    // Nothing survives the A-Z0-9 strip, so the trimmed original is the key.
    expect(normalizeCourseKey("  סמינר מחקר  ")).toBe("סמינר מחקר");
    const a = courseColorIndex("סמינר מחקר");
    const b = courseColorIndex("קורס אחר לגמרי");
    expect(courseColorIndex("סמינר מחקר")).toBe(a);
    expect(a).not.toBe(b);
  });
});

describe("courseColorIndex — spread", () => {
  it("does not funnel a whole department onto one colour", () => {
    // Six codes sharing the 0651 prefix: a shift-and-add hash gives these a
    // near-identical value and they clump. This is the reason FNV is used.
    const sameDept = [
      "0651-1010", "0651-1020", "0651-1030",
      "0651-2010", "0651-2020", "0651-3001",
    ];
    const distinct = new Set(sameDept.map(courseColorIndex));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });

  it("uses the whole ramp across a realistic catalog", () => {
    const used = new Set<number>();
    // 302 synthetic codes in the real TAU shape.
    for (let dept = 0; dept < 20; dept++) {
      for (let n = 0; n < 16; n++) {
        used.add(courseColorIndex(`0${600 + dept}-${1000 + n * 7}`));
      }
    }
    expect(used.size).toBe(COURSE_COLOR_COUNT);
  });
});

describe("CSS value helpers", () => {
  it("courseColor returns a CSS variable reference, not a hex", () => {
    const value = courseColor("0651-1010");
    expect(value).toMatch(/^var\(--course-color-(\d|1[01])\)$/);
  });

  it("courseSurface mixes toward the card by default so it tracks the theme", () => {
    expect(courseSurface("0651-1010", 14)).toBe(
      "color-mix(in srgb, var(--course-color-9) 14%, var(--card))"
    );
  });

  it("courseSurface accepts an explicit base", () => {
    expect(courseSurface("0651-1010", 8, "var(--background)")).toBe(
      "color-mix(in srgb, var(--course-color-9) 8%, var(--background))"
    );
  });

  it("courseEdge fades to transparent, not to the card", () => {
    expect(courseEdge("0651-1010", 40)).toBe(
      "color-mix(in srgb, var(--course-color-9) 40%, transparent)"
    );
  });

  it("every surface asking for the same course gets the same colour", () => {
    const code = "1011-3310";
    const fromGrid = courseColor(code);
    const fromCard = courseColor(code.toLowerCase());
    const fromAgenda = courseColor(code.replace("-", ""));
    expect(new Set([fromGrid, fromCard, fromAgenda]).size).toBe(1);
  });
});

describe("globals.css contract", () => {
  const css = readFileSync(
    path.resolve(__dirname, "../../app/globals.css"),
    "utf8"
  );

  it("declares exactly COURSE_COLOR_COUNT variables in the light ramp", () => {
    // An index with no matching variable paints transparent — a silent
    // production-only failure. Assert the CSS and the TS agree.
    for (let i = 0; i < COURSE_COLOR_COUNT; i++) {
      expect(css).toContain(`--course-color-${i}:`);
    }
    const declared = new Set(
      [...css.matchAll(/--course-color-(\d+)\s*:/g)].map((m) => Number(m[1]))
    );
    expect(declared.size).toBe(COURSE_COLOR_COUNT);
    expect(Math.max(...declared)).toBe(COURSE_COLOR_COUNT - 1);
  });

  it("declares the ramp twice — once for light, once for dark", () => {
    const occurrences = [...css.matchAll(/--course-color-0\s*:/g)].length;
    expect(occurrences).toBe(2);
    const darkBlock = css.slice(css.indexOf("\n.dark {"));
    for (let i = 0; i < COURSE_COLOR_COUNT; i++) {
      expect(darkBlock).toContain(`--course-color-${i}:`);
    }
  });

  it("every ramp value is a 6-digit hex (no oklch/hsl that color-mix would widen)", () => {
    const values = [...css.matchAll(/--course-color-\d+:\s*([^;]+);/g)].map((m) =>
      (m[1] ?? "").trim()
    );
    expect(values).toHaveLength(COURSE_COLOR_COUNT * 2);
    for (const v of values) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("light and dark bands differ on every index — a shared value would fail one theme", () => {
    const byIndex = new Map<number, string[]>();
    for (const m of css.matchAll(/--course-color-(\d+):\s*([^;]+);/g)) {
      const idx = Number(m[1]);
      const list = byIndex.get(idx) ?? [];
      list.push((m[2] ?? "").trim().toUpperCase());
      byIndex.set(idx, list);
    }
    for (const [idx, values] of byIndex) {
      expect(values, `index ${idx}`).toHaveLength(2);
      expect(values[0], `index ${idx}`).not.toBe(values[1]);
    }
  });
});

// ── Contrast: the accessibility claim, checked rather than asserted ──
// The app has passed axe with zero serious/critical findings and must stay
// that way. The dots and hairlines this ramp paints are non-text UI, which
// WCAG 1.4.11 holds to 3:1 against their background. Compute it.

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("contrast against the card in both themes", () => {
  const css = readFileSync(
    path.resolve(__dirname, "../../app/globals.css"),
    "utf8"
  );
  const all = [...css.matchAll(/--course-color-(\d+):\s*(#[0-9A-Fa-f]{6});/g)];
  // First COUNT declarations are the light ramp (:root), the rest are .dark.
  const light = all.slice(0, COURSE_COLOR_COUNT).map((m) => m[2]!);
  const dark = all.slice(COURSE_COLOR_COUNT).map((m) => m[2]!);

  const LIGHT_CARD = "#FFFFFF";
  const DARK_CARD = "#16161C";

  it("light ramp clears 3:1 on the white card", () => {
    light.forEach((hex, i) => {
      expect(contrast(hex, LIGHT_CARD), `light index ${i} (${hex})`).toBeGreaterThanOrEqual(3);
    });
  });

  it("dark ramp clears 3:1 on the dark card", () => {
    dark.forEach((hex, i) => {
      expect(contrast(hex, DARK_CARD), `dark index ${i} (${hex})`).toBeGreaterThanOrEqual(3);
    });
  });

  it("a 14% block fill leaves body text well above 4.5:1 in both themes", () => {
    // The grid block fills with `color-mix(... 14%, var(--card))` and prints
    // plain --foreground on top. Approximate the mix in sRGB and check the
    // WORST hue, which is what a real student would hit.
    const mix = (fg: string, bg: string, pct: number) => {
      const f = parseInt(fg.slice(1), 16);
      const b = parseInt(bg.slice(1), 16);
      const ch = (shift: number) =>
        Math.round((((f >> shift) & 255) * pct + ((b >> shift) & 255) * (100 - pct)) / 100);
      return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
    };

    for (const hex of light) {
      expect(contrast("#18181B", mix(hex, LIGHT_CARD, 14)), `light ${hex}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const hex of dark) {
      expect(contrast("#ECECEE", mix(hex, DARK_CARD, 14)), `dark ${hex}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
