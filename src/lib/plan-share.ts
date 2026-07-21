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
export function encodePlan(courses: SharedCourse[]): string {
  const json = JSON.stringify({ v: 1, c: courses });
  return toBase64(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Unpack a plan token. Returns null on anything malformed (never throws). */
export function decodePlan(token: string): SharedCourse[] | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(fromBase64(b64)) as { v?: number; c?: unknown };
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
