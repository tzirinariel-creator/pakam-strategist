// =========================================================================
// Plan-hash answer cache (Project 2 — Tier 1). Caches LLM answers keyed to the
// student's CURRENT plan, so re-asking the same question on an unchanged plan
// returns instantly and spends zero shared free-tier quota. The cache resets
// the moment the plan changes — a stale answer must never resurface after the
// numbers it was based on have moved. Client-side (localStorage); no DB change.
// =========================================================================

import type { QAContext } from "@/lib/degree-qa";

// v2: flushes answers cached before the #36 truncation fix (cut mid-word).
const NS = "pk-ai-cache-v2";
const MAX_ENTRIES = 50;

/**
 * Cheap deterministic hash of the plan-relevant context fields. Any change to
 * the student's situation (credits, average, gaps, group, locale…) flips the
 * hash and invalidates the whole cache.
 */
export function hashContext(c: QAContext): string {
  const sig = [
    c.effectiveTotal, c.earned, c.planned, c.miluimExemption, c.mandatory,
    c.elective, c.seminar, c.focusAreaCredits, c.focusAreaTarget,
    c.englishCourseCount, c.courseAverage ?? "n", c.currentYear,
    c.amiramScore ?? "n", c.miluimGroupName ?? "n", c.binaryRemaining,
    c.hasFocusArea ? 1 : 0, c.failedRules.length, c.seminarPlannedCount,
    c.isHe ? "he" : "en",
  ].join(",");
  let h = 5381;
  for (let i = 0; i < sig.length; i++) {
    h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function keyFor(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

interface Store {
  planHash: string;
  entries: Record<string, string>;
  order: string[];
}

function load(): Store | null {
  try {
    const raw = localStorage.getItem(NS);
    return raw ? (JSON.parse(raw) as Store) : null;
  } catch {
    return null;
  }
}

function save(s: Store): void {
  try {
    localStorage.setItem(NS, JSON.stringify(s));
  } catch {
    // Storage full/blocked — caching is best-effort, never a hard failure.
  }
}

/** A cached LLM answer for this question under the current plan, or null. */
export function readCachedAnswer(question: string, planHash: string): string | null {
  if (typeof window === "undefined") return null;
  const s = load();
  if (!s || s.planHash !== planHash) return null;
  return s.entries[keyFor(question)] ?? null;
}

/** Cache an LLM answer for the current plan. Resets the store if the plan
 *  changed since the last write, so stale answers can't resurface. LRU-capped. */
export function writeCachedAnswer(question: string, planHash: string, answer: string): void {
  if (typeof window === "undefined" || !answer.trim()) return;
  let s = load();
  if (!s || s.planHash !== planHash) s = { planHash, entries: {}, order: [] };
  const k = keyFor(question);
  if (!(k in s.entries)) s.order.push(k);
  s.entries[k] = answer;
  while (s.order.length > MAX_ENTRIES) {
    const old = s.order.shift();
    if (old) delete s.entries[old];
  }
  save(s);
}
