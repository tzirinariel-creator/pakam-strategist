// =========================================================================
// The week as a PICTURE (22-15)
// =========================================================================
// Ariel: "איך אפשר להבין משהו בוואטסאפ ככה. מצידי שזה יהיה צילום מסך."
//
// The text share was rewritten once already and it is as good as a text share
// gets — but a timetable is a GRID, and a grid flattened into twenty bullet
// lines stops being a timetable. He is right, and he named the answer.
//
// So: draw it. A single canvas, no libraries, no external assets (a strict CSP
// governs this app and a font file fetched at share time would simply fail),
// handed to the OS share sheet as a PNG file where that exists and downloaded
// where it does not.
//
// Two things this deliberately does NOT do:
//
//  · It does not claim to be a screenshot of the app. It is its own object —
//    a card built for a phone screen at 2× — because a screenshot of a
//    responsive web page shared into a chat is exactly the unreadable thing
//    being replaced.
//  · It carries no grade, no average and no personal identifier. A timetable
//    gets forwarded; whatever is on it travels with it.

export interface WeekImageSession {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  courseName: string;
  sessionTypeLabel: string | null;
  color: string;
  room?: string | null;
}

const DAY_ORDER = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const DAY_HE: Record<string, string> = {
  SUNDAY: "א׳", MONDAY: "ב׳", TUESDAY: "ג׳", WEDNESDAY: "ד׳", THURSDAY: "ה׳", FRIDAY: "ו׳",
};
const DAY_EN: Record<string, string> = {
  SUNDAY: "Sun", MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri",
};

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The hours the week actually occupies, padded to whole hours. */
export function weekBounds(sessions: readonly WeekImageSession[]): { from: number; to: number } {
  if (sessions.length === 0) return { from: 8 * 60, to: 18 * 60 };
  let lo = Infinity, hi = -Infinity;
  for (const s of sessions) {
    lo = Math.min(lo, minutes(s.startTime));
    hi = Math.max(hi, minutes(s.endTime));
  }
  return { from: Math.floor(lo / 60) * 60, to: Math.ceil(hi / 60) * 60 };
}

/** Which day columns to draw — an empty Friday is not worth a sixth of the width. */
export function daysWithClasses(sessions: readonly WeekImageSession[]): string[] {
  const present = new Set(sessions.map((s) => s.dayOfWeek));
  const days = DAY_ORDER.filter((d) => present.has(d));
  return days.length > 0 ? [...days] : DAY_ORDER.slice(0, 5);
}

/** Break a label onto at most `maxLines` lines that fit `width`, ellipsising the last. */
export function wrapToWidth(
  ctx: { measureText: (s: string) => { width: number } },
  text: string,
  width: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === 0) return [];
  // Ellipsise only if something was actually left out.
  const rendered = lines.join(" ");
  if (rendered.length < text.replace(/\s+/g, " ").length) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

export interface WeekImageOptions {
  semesterLabel: string;
  isHe: boolean;
  /** Device pixel scale. 2 is the sensible default for a phone screenshot. */
  scale?: number;
}

/**
 * Draw the week onto a canvas and return it. Caller turns it into a blob.
 *
 * Exported separately from the blob step so the geometry is testable in node
 * without a canvas implementation (see weekBounds / daysWithClasses /
 * wrapToWidth above, which is where the logic that can be wrong actually is).
 */
export function drawWeekImage(
  canvas: HTMLCanvasElement,
  sessions: readonly WeekImageSession[],
  opts: WeekImageOptions,
): HTMLCanvasElement {
  const { semesterLabel, isHe, scale = 2 } = opts;
  const days = daysWithClasses(sessions);
  const { from, to } = weekBounds(sessions);
  const hours = Math.max(1, (to - from) / 60);

  // Laid out in CSS pixels, then scaled once — so every number below reads as
  // a real measurement rather than a doubled one.
  const PAD = 20, HEADER = 74, DAY_H = 30, FOOT = 34;
  const COL_W = 104, HOUR_H = 58, TIME_W = 44;
  const W = PAD * 2 + TIME_W + COL_W * days.length;
  const H = PAD * 2 + HEADER + DAY_H + hours * HOUR_H + FOOT;

  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  // The share is one fixed object, so it is drawn in ONE palette rather than
  // following the sender's theme — a dark-mode card forwarded into a light
  // chat, or the reverse, is how a shared image ends up looking broken.
  const INK = "#18181B", MUTED = "#71717A", LINE = "#E4E4E7", BG = "#FFFFFF";
  const FONT = `system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";
  ctx.direction = isHe ? "rtl" : "ltr";

  // RTL lays the columns out from the right edge inward.
  const colX = (i: number) => (isHe ? W - PAD - TIME_W - COL_W * (i + 1) : PAD + TIME_W + COL_W * i);
  const headX = isHe ? W - PAD : PAD;
  ctx.textAlign = isHe ? "right" : "left";

  ctx.fillStyle = INK;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(isHe ? "המערכת שלי" : "My timetable", headX, PAD + 16);
  ctx.fillStyle = MUTED;
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText(semesterLabel.replace(/\s*—\s*/g, " · "), headX, PAD + 40);

  const gridTop = PAD + HEADER + DAY_H;

  // Day headers
  ctx.textAlign = "center";
  ctx.font = `600 13px ${FONT}`;
  days.forEach((d, i) => {
    ctx.fillStyle = MUTED;
    ctx.fillText(isHe ? DAY_HE[d]! : DAY_EN[d]!, colX(i) + COL_W / 2, PAD + HEADER + DAY_H / 2);
  });

  // Hour rules + labels
  ctx.font = `400 11px ${FONT}`;
  for (let h = 0; h <= hours; h++) {
    const y = gridTop + h * HOUR_H;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(W - PAD, y + 0.5);
    ctx.stroke();
    if (h < hours) {
      ctx.fillStyle = MUTED;
      ctx.textAlign = isHe ? "left" : "right";
      const label = `${String(Math.floor((from + h * 60) / 60)).padStart(2, "0")}:00`;
      ctx.fillText(label, isHe ? PAD + 4 : PAD + TIME_W - 8, y + 12);
    }
  }

  // Blocks
  ctx.textAlign = isHe ? "right" : "left";
  for (const s of sessions) {
    const i = days.indexOf(s.dayOfWeek);
    if (i < 0) continue;
    const top = gridTop + ((minutes(s.startTime) - from) / 60) * HOUR_H;
    const height = Math.max(26, ((minutes(s.endTime) - minutes(s.startTime)) / 60) * HOUR_H - 3);
    const x = colX(i) + 3;
    const w = COL_W - 6;

    ctx.fillStyle = `${s.color}22`;
    ctx.beginPath();
    ctx.roundRect(x, top + 1.5, w, height, 7);
    ctx.fill();
    // The course's own colour as a spine, so two blocks in one column are
    // still two courses at a glance.
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.roundRect(isHe ? x + w - 3 : x, top + 1.5, 3, height, 2);
    ctx.fill();

    const textX = isHe ? x + w - 8 : x + 8;
    ctx.fillStyle = INK;
    ctx.font = `600 11px ${FONT}`;
    const nameLines = wrapToWidth(ctx, s.courseName, w - 16, height >= 50 ? 3 : 2);
    nameLines.forEach((ln, li) => ctx.fillText(ln, textX, top + 14 + li * 13));

    const below = top + 14 + nameLines.length * 13;
    if (below + 10 < top + height) {
      ctx.fillStyle = MUTED;
      ctx.font = `400 10px ${FONT}`;
      const meta = [`${s.startTime}–${s.endTime}`, s.sessionTypeLabel, s.room]
        .filter(Boolean)
        .join(" · ");
      ctx.fillText(wrapToWidth(ctx, meta, w - 16, 1)[0] ?? "", textX, below + 2);
    }
  }

  ctx.fillStyle = MUTED;
  ctx.font = `400 11px ${FONT}`;
  ctx.textAlign = isHe ? "right" : "left";
  ctx.fillText(isHe ? "נבנה עם פכמון" : "Built with Pakamon", headX, H - PAD - 6);

  return canvas;
}

/**
 * Render and hand the image to whoever should get it.
 *
 * `navigator.share` with a file is the only path that lands the picture inside
 * a chat in one step, and it exists on phones — which is where a timetable is
 * shared. Everywhere else the file is downloaded, and the caller says so.
 *
 * Returns what actually happened, so the UI can tell the truth about it rather
 * than claiming "shared" when a file quietly landed in Downloads.
 */
export async function shareWeekImage(
  sessions: readonly WeekImageSession[],
  opts: WeekImageOptions,
): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  if (typeof document === "undefined") return "failed";
  const canvas = drawWeekImage(document.createElement("canvas"), sessions, opts);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "failed";

  const name = opts.isHe ? "המערכת-שלי.png" : "my-timetable.png";
  const file = new File([blob], name, { type: "image/png" });

  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: opts.isHe ? "המערכת שלי" : "My timetable" });
      return "shared";
    } catch (e) {
      // A user who backs out of the share sheet has not hit an error, and must
      // not be shown one — nor be handed a surprise download instead.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      return "failed";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revoke on the next tick — revoking synchronously races the click in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
