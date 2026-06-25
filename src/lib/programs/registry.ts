// =========================================
// Program Registry — maps program IDs to definitions
//
// Currently: TAU PPE + TAU Law.
// =========================================

import type { ProgramDefinition } from "./types";
import { TAU_PPE_2025 } from "./definitions/tau-ppe-2025";
import { TAU_LAW_2025 } from "./definitions/tau-law-2025";

// ── Registry ──

const PROGRAMS: Record<string, ProgramDefinition> = {
  "tau-ppe-2025": TAU_PPE_2025,
  "tau-law-2025": TAU_LAW_2025,
};

// ── Default (current) program ──
// Until we support multi-program, this is always PPE.

const DEFAULT_PROGRAM_ID = "tau-ppe-2025";

/**
 * Get the currently active program definition.
 * Returns the default program (PPE) — use getProgramById() for per-user support.
 */
export function getActiveProgram(): ProgramDefinition {
  return PROGRAMS[DEFAULT_PROGRAM_ID]!;
}

/**
 * Get a program by its registry ID (e.g. "tau-ppe-2025", "tau-law-2025").
 * Falls back to the default program if ID is null/undefined/not found.
 *
 * Use this for per-user program resolution:
 *   const program = getProgramById(user.programId);
 */
export function getProgramById(
  programId: string | null | undefined
): ProgramDefinition {
  if (!programId) return PROGRAMS[DEFAULT_PROGRAM_ID]!;
  return PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]!;
}

/**
 * Get a program by ID (returns undefined if not found).
 */
export function getProgram(id: string): ProgramDefinition | undefined {
  return PROGRAMS[id];
}

/**
 * List all registered programs.
 */
export function listPrograms(): ProgramDefinition[] {
  return Object.values(PROGRAMS);
}

/**
 * Get all unique discipline IDs across all registered programs.
 * Useful for Zod input validation that needs to accept any valid discipline.
 */
export function getAllDisciplineIds(): [string, ...string[]] {
  const ids = new Set<string>();
  for (const program of Object.values(PROGRAMS)) {
    for (const d of program.disciplines) {
      ids.add(d.id);
    }
  }
  const arr = [...ids];
  if (arr.length === 0) throw new Error("No disciplines registered");
  return arr as [string, ...string[]];
}

// ── Re-exports ──
export { TAU_PPE_2025, TAU_LAW_2025 };
export type { ProgramDefinition } from "./types";
