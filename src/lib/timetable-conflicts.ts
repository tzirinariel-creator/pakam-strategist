/**
 * Timetable conflicts — pure logic.
 *
 * Both competitors we studied (TauPlan, bid-it) draw a weekly grid and stop:
 * measured 13.8/2026, TauPlan simply splits the column in half when two
 * meetings overlap and says nothing (`docs/מחקר-מתחרים-מערכת-שעות.md` §1).
 * We already DETECTED overlaps — we just never said *with what*. This module
 * turns "there is a clash" into "X clashes with Y on Tuesday 12:00–13:00",
 * which is the only form of the sentence a student can act on.
 *
 * Everything here is pure and locale-agnostic apart from `describeConflictPair`,
 * which takes the already-translated day label from the caller.
 */

// ─── Duplicate meetings ─────────────────────────────────────────────

/** The fields that identify a real-world meeting, plus the detail fields. */
export interface MeetingLike {
  courseCode: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  groupCode?: string | null;
  room?: string | null;
  building?: string | null;
  lecturerName?: string | null;
}

/** How much real detail a row carries — used to pick the survivor of a dupe. */
function detailScore(m: MeetingLike): number {
  return [m.room, m.building, m.lecturerName].filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
}

/**
 * Collapse rows that describe the SAME meeting.
 *
 * The production `schedule_sessions` table holds true duplicates — verified
 * 13.8/2026 on the demo plan: course 1011-3310, Tuesday 12:00–14:00, tutorial,
 * group 01, same room and same lecturer, under two different row ids. Painted
 * naively the grid split the column in half and then reported the meeting as
 * clashing with itself ("כלכלה בינלאומית חופף עם כלכלה בינלאומית") — exactly the
 * "it looks broken" reading. A student can only be in one place once, so one
 * meeting gets one block.
 *
 * The survivor is the row carrying the most detail (a room, a building, a real
 * lecturer), so collapsing never costs information; ties keep the first row and
 * the input order is otherwise preserved.
 *
 * This is a DISPLAY guard, not a data fix — the duplicate rows still need
 * cleaning up at the source.
 */
export function dedupeMeetings<T extends MeetingLike>(rows: T[]): T[] {
  const bestIndexByKey = new Map<string, number>();
  const keep: (T | null)[] = [];

  for (const row of rows) {
    const key = [
      row.courseCode,
      row.dayOfWeek,
      row.startTime,
      row.endTime,
      row.sessionType,
      row.groupCode ?? "",
    ].join("|");
    const seenAt = bestIndexByKey.get(key);
    if (seenAt === undefined) {
      bestIndexByKey.set(key, keep.length);
      keep.push(row);
      continue;
    }
    const incumbent = keep[seenAt] as T;
    // Strictly greater — a tie keeps the row that arrived first.
    if (detailScore(row) > detailScore(incumbent)) keep[seenAt] = row;
  }

  return keep.filter((r): r is T => r !== null);
}

/** Minimal shape a placed block must expose for conflict analysis. */
export interface ConflictCandidate {
  id: string;
  /** 0 = Sunday … 5 = Friday. */
  day: number;
  /** Fractional hour: 12.5 === 12:30. */
  startHour: number;
  endHour: number;
  courseCode: string;
  courseName: string;
}

export interface ConflictPair {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  day: number;
  /** The overlapping window only — not either block's full span. */
  overlapStart: number;
  overlapEnd: number;
}

/** "Who does THIS block clash with", from the clashing block's point of view. */
export interface ConflictPartner {
  otherId: string;
  otherName: string;
  day: number;
  overlapStart: number;
  overlapEnd: number;
}

/**
 * Every unordered pair of blocks that share a day and overlap in time.
 *
 * Two meetings of the SAME course still count: a student cannot sit in a
 * lecture and its tutorial at once, and hiding that would be the same silent
 * failure the competitors ship.
 *
 * Zero-length blocks (startHour === endHour, a data glitch) never conflict —
 * a strict `<` on both sides makes back-to-back meetings (10–12, 12–14) clean.
 */
export function findConflictPairs(slots: ConflictCandidate[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      if (a.day !== b.day) continue;
      // A zero-length block is a data glitch, not a meeting — it can't clash.
      if (a.endHour <= a.startHour || b.endHour <= b.startHour) continue;
      if (!(a.startHour < b.endHour && b.startHour < a.endHour)) continue;
      pairs.push({
        aId: a.id,
        bId: b.id,
        aName: a.courseName,
        bName: b.courseName,
        day: a.day,
        overlapStart: Math.max(a.startHour, b.startHour),
        overlapEnd: Math.min(a.endHour, b.endHour),
      });
    }
  }
  return pairs;
}

/** Flat set of every block id involved in at least one clash. */
export function conflictIds(pairs: ConflictPair[]): Set<string> {
  const out = new Set<string>();
  for (const p of pairs) {
    out.add(p.aId);
    out.add(p.bId);
  }
  return out;
}

/** blockId → the blocks it clashes with, so a block can name its counterpart. */
export function conflictPartners(pairs: ConflictPair[]): Map<string, ConflictPartner[]> {
  const out = new Map<string, ConflictPartner[]>();
  const push = (id: string, partner: ConflictPartner) => {
    const arr = out.get(id);
    if (arr) arr.push(partner);
    else out.set(id, [partner]);
  };
  for (const p of pairs) {
    push(p.aId, {
      otherId: p.bId,
      otherName: p.bName,
      day: p.day,
      overlapStart: p.overlapStart,
      overlapEnd: p.overlapEnd,
    });
    push(p.bId, {
      otherId: p.aId,
      otherName: p.aName,
      day: p.day,
      overlapStart: p.overlapStart,
      overlapEnd: p.overlapEnd,
    });
  }
  return out;
}

/** 12.5 → "12:30". Always two digits, always 24h — never a locale surprise. */
export function formatHour(hour: number): string {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "12:00–13:00" with an en dash. Render inside <bdi dir="ltr">. */
export function formatHourRange(start: number, end: number): string {
  return `${formatHour(start)}–${formatHour(end)}`;
}

/**
 * The human sentence, split so the caller can wrap the numeric range in a
 * `<bdi dir="ltr">` — an RTL paragraph must never carry `dir="ltr"` on text
 * that contains Hebrew words (repo iron rule).
 *
 * `dayLabel` arrives already translated ("שלישי" / "Tuesday").
 */
export function describeConflictPair(
  pair: ConflictPair,
  dayLabel: string,
  isHe: boolean,
): { lead: string; range: string } {
  return {
    lead: isHe
      ? `${pair.aName} חופף עם ${pair.bName} · ${dayLabel}`
      : `${pair.aName} clashes with ${pair.bName} · ${dayLabel}`,
    range: formatHourRange(pair.overlapStart, pair.overlapEnd),
  };
}

/**
 * The same sentence from ONE block's point of view, for the detail card:
 * "חופף עם מבוא לכלכלה · שלישי" + "12:00–13:00".
 */
export function describeConflictPartner(
  partner: ConflictPartner,
  dayLabel: string,
  isHe: boolean,
): { lead: string; range: string } {
  return {
    lead: isHe
      ? `חופף עם ${partner.otherName} · ${dayLabel}`
      : `Clashes with ${partner.otherName} · ${dayLabel}`,
    range: formatHourRange(partner.overlapStart, partner.overlapEnd),
  };
}
