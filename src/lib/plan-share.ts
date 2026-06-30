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

function toBase64(s: string): string {
  if (typeof btoa !== "undefined") return btoa(s);
  // Node / test fallback
  return Buffer.from(s, "utf8").toString("base64");
}

function fromBase64(s: string): string {
  if (typeof atob !== "undefined") return atob(s);
  return Buffer.from(s, "base64").toString("utf8");
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
        (r.s === "FALL" || r.s === "SPRING" || r.s === "SUMMER")
      ) {
        out.push({ c: r.c, y: r.y, s: r.s });
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
