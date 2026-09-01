import { heNoun } from "@/lib/he-count";
// =========================================
// Plan sharing — encode a degree plan into a shareable URL
// =========================================
// Zero backend, zero cost: the whole plan (course codes + year + semester) is
// packed into a base64url string that rides in the share link. A friend opens
// the link, sees a read-only view, and can copy it into their own plan.

export interface SharedCourse {
  /** Course code, e.g. "0651-1007". */
  c: string;
  /** Planned year (1–4). */
  y: number;
  /** Planned semester. */
  s: "FALL" | "SPRING" | "SUMMER";
}

// UTF-8-safe base64 — btoa/atob are Latin-1 only, so any future Hebrew field
// in the token (a name, a label) would THROW. Course codes are ASCII today;
// this is immunization, not a behavior change.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  if (typeof btoa !== "undefined") {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(s: string): string {
  if (typeof atob !== "undefined") {
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  }
  return Buffer.from(s, "base64").toString("utf8");
}

// ---- return-after-auth (closes the viral loop) ----------------------------
// A logged-out friend opens a shared plan, clicks join/login, and must land
// BACK on the plan afterwards. Stored WITHOUT the locale prefix (the i18n
// router adds its own — keeping it would produce /he/he/… → 404), consumed
// once on the dashboard (which every auth path — password, OAuth, email
// confirm — ultimately reaches), relative paths only (no open redirect),
// 24h expiry.
const RETURN_KEY = "pakamon.shared-plan-return";

export function rememberSharedPlanReturn(): void {
  try {
    const path =
      window.location.pathname.replace(/^\/(he|en)(?=\/|$)/, "") + window.location.search;
    if (!path.startsWith("/") || path.startsWith("//")) return;
    localStorage.setItem(RETURN_KEY, JSON.stringify({ path, ts: Date.now() }));
  } catch {
    /* storage blocked — the CTA still works, just without the return */
  }
}

export function consumeSharedPlanReturn(): string | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    localStorage.removeItem(RETURN_KEY);
    if (!raw) return null;
    const { path, ts } = JSON.parse(raw) as { path?: string; ts?: number };
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return null;
    if (typeof ts !== "number" || Date.now() - ts > 24 * 60 * 60 * 1000) return null;
    return path;
  } catch {
    return null;
  }
}

/** Pack a plan into a URL-safe token. */
// Ariel, twice: "למה הודעת הוואטסאפ עדיין נראית כמו הצרות שלי?" ·
// "עוד שיתוף זוועתי בוואטסאפ".
//
// The token was JSON — {"c":"1011-2101","y":2,"s":"FALL"} is 34 characters per
// course before base64 inflates it by a third. A seven-course plan produced a
// ~1,900-character URL: nine tenths of the WhatsApp message was an unreadable
// string, and the four lines a human might actually read were buried above it.
//
// v2 packs the same three facts into "10112101:2F" — the dash comes off (every
// code is ####-####), the semester is one letter. Same plan, about a tenth of
// the characters. v1 tokens still decode, so links already sent keep working.
const SEM_CHAR: Record<SharedCourse["s"], string> = { FALL: "F", SPRING: "S", SUMMER: "U" };
const CHAR_SEM: Record<string, SharedCourse["s"]> = { F: "FALL", S: "SPRING", U: "SUMMER" };

export function encodePlan(courses: SharedCourse[]): string {
  const packed =
    "2|" +
    courses
      .filter(
        (c) =>
          typeof c?.c === "string" &&
          /^\d{4}-?\d{4}$/.test(c.c) &&
          Number.isInteger(c.y) &&
          c.y >= 1 &&
          c.y <= 4 &&
          SEM_CHAR[c.s] != null,
      )
      .map((c) => `${c.c.replace(/-/g, "")}:${c.y}${SEM_CHAR[c.s]}`)
      .join(",");
  return toBase64(packed).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Unpack a plan token. Returns null on anything malformed (never throws). */
export function decodePlan(token: string): SharedCourse[] | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const raw = fromBase64(b64);

    // v2 — the compact form. Anything malformed falls through to null via the
    // same validation the JSON path uses.
    if (raw.startsWith("2|")) {
      // A malformed entry drops; it does not sink the link. One corrupt row in
      // a pasted URL should still let a friend import the other six — the same
      // forgiveness the v1 path has had since audit-r2.
      const out: SharedCourse[] = [];
      for (const part of raw.slice(2).split(",")) {
        if (!part) continue;
        const m = /^(\d{4})(\d{4}):(\d)([FSU])$/.exec(part);
        if (!m) continue;
        const year = Number(m[3]);
        if (year < 1 || year > 4) continue;
        const sem = CHAR_SEM[m[4]!];
        if (!sem) continue;
        out.push({ c: `${m[1]}-${m[2]}`, y: year, s: sem });
      }
      return out.length > 0 ? out : null;
    }

    const obj = JSON.parse(raw) as { v?: number; c?: unknown };
    if (!obj || !Array.isArray(obj.c)) return null;
    const out: SharedCourse[] = [];
    for (const x of obj.c as unknown[]) {
      const r = x as Record<string, unknown>;
      if (
        typeof r.c === "string" &&
        typeof r.y === "number" &&
        Number.isInteger(r.y) &&
        r.y >= 1 &&
        r.y <= 4 &&
        (r.s === "FALL" || r.s === "SPRING" || r.s === "SUMMER")
      ) {
        // Year is validated to an int in 1..4 HERE so a hand-crafted token with
        // y:99 / y:-5 / y:1.7 drops just that row, degrading to the valid subset
        // instead of failing the whole "copy to my plan" batch at savePlan's zod.
        out.push({ c: r.c, y: r.y, s: r.s });
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

// =========================================================================
// The WhatsApp message itself — #25
// =========================================================================
// Ariel: "כפתור השיתוף בוואטסאפ ממש גרוע ואי אפשר באמת להבין ממנו כלום".
//
// He is right, and the reason is structural: the message was one generic
// sentence followed by a very long `?d=<base64>` URL. The person receiving it
// could not tell what was in the plan without clicking, and a wall of encoded
// characters from an app they have never heard of reads like spam — which is
// the worst possible first contact for the one organic growth channel this
// product has.
//
// A share message has to stand on its own. This one says which semester, how
// many courses, how many ש״ס, and names a few of them — so the recipient knows
// what they are being sent before they decide whether to open it.

export interface PlanShareCourse {
  code: string;
  nameHe: string;
  nameEn?: string | null;
  credits: number;
  year: number;
  semester: "FALL" | "SPRING" | "SUMMER";
}

const SEMESTER_HE: Record<string, string> = { FALL: "סמסטר א׳", SPRING: "סמסטר ב׳", SUMMER: "סמסטר קיץ" };
const YEAR_HE = ["", "שנה א׳", "שנה ב׳", "שנה ג׳", "שנה ד׳"];

/** How many course names to name before saying "ועוד N". Four fits a preview. */
const NAMED_COURSES = 4;

export function buildPlanShareText(
  courses: PlanShareCourse[],
  opts: { url: string; isHe: boolean },
): string {
  const { url, isHe } = opts;
  if (courses.length === 0) {
    return isHe
      ? `בניתי תוכנית תואר בפכמון — אפשר לראות ולהעתיק כאן:\n${url}`
      : `I built a degree plan in Pakamon — view and copy it here:\n${url}`;
  }

  // Deliberately computed AFTER `listed` below, so the count, the credits and
  // the bullets all describe one semester rather than three different sets.
  // Lead with the semester the plan is mostly about, so the message has a subject.
  const counts = new Map<string, number>();
  for (const c of courses) {
    const key = `${c.year}|${c.semester}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [topKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const [topYear, topSem] = topKey.split("|");
  const label = isHe
    ? `${YEAR_HE[Number(topYear)] ?? ""} ${SEMESTER_HE[topSem!] ?? ""}`.trim()
    : `Year ${topYear}, ${topSem!.toLowerCase()}`;

  // The headline names ONE semester; the bullets used to be the first four
  // courses in query order, so the two routinely described different terms —
  // a message that contradicts its own title in four lines.
  const inLeadSemester = courses.filter(
    (c) => String(c.year) === topYear && c.semester === topSem,
  );
  const listed = inLeadSemester.length > 0 ? inLeadSemester : courses;
  const credits = listed.reduce((sum, c) => sum + (c.credits || 0), 0);
  const names = listed
    .slice(0, NAMED_COURSES)
    .map((c) => (isHe ? c.nameHe : (c.nameEn ?? c.nameHe)));
  const more = listed.length - names.length;

  const lines: string[] = [];
  if (isHe) {
    lines.push(`*תוכנית התואר שלי — ${label}*`);
    lines.push(`${listed.length === 1 ? "קורס אחד" : `${heNoun(listed.length, "קורס", "קורסים")}`} · ${credits} ש״ס`);
    lines.push("");
    for (const n of names) lines.push(`• ${n}`);
    if (more > 0) lines.push(`• ועוד ${more === 1 ? "קורס אחד" : `${heNoun(more, "קורס", "קורסים")}`}`);
    lines.push("");
    lines.push("אפשר לראות את הכול ולהעתיק לעצמכם:");
  } else {
    lines.push(`*My degree plan — ${label}*`);
    lines.push(`${listed.length} course${listed.length === 1 ? "" : "s"} · ${credits} credits`);
    lines.push("");
    for (const n of names) lines.push(`• ${n}`);
    if (more > 0) lines.push(`• and ${more} more`);
    lines.push("");
    lines.push("See it all and copy it for yourself:");
  }
  lines.push(url);
  return lines.join("\n");
}
