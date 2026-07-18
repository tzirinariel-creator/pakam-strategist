import type { RuleContext, RegulationRule } from "@/types/regulation";
import {
  binaryDegreeCap,
  binaryCapRemaining,
  honorsBinaryStatus,
  type MiluimGroupKey,
} from "@/lib/miluim";
import { result } from "./_result";

// -------------------------------------------------------------------
// PKM-024: Miluim binary-conversion degree cap (NON-BLOCKING)
// -------------------------------------------------------------------
// Domain §6: a BA student may convert at most 5 courses to binary (pass/fail)
// across the whole degree (or the group's own degree cap, whichever is higher).
// This is a planning guard, NOT a graduation gate — it is WARNING/INFO ONLY and
// must NEVER ERROR (it must not block the year gate or graduation). Neutral when
// no binary conversions have been used.

export const ruleMiluimBinaryCap: RegulationRule = (ctx: RuleContext) => {
  const group = (ctx.miluimGroup ?? "NONE") as MiluimGroupKey;
  const used = Math.max(0, ctx.miluimBinaryUsed ?? 0);
  const cap = binaryDegreeCap(group);
  const remaining = binaryCapRemaining(used, group);
  const over = used > cap;

  return result(
    "PKM-024",
    "Miluim Binary Conversion Cap",
    "מכסת המרת קורסים לבינארי (מילואים)",
    // "passed" only when at/under the cap. Over the cap is a WARNING — never an
    // ERROR — so it can never block graduation or the year-transition gate.
    !over,
    over ? "WARNING" : "INFO",
    over
      ? `Binary conversions used (${used}) exceed the BA cap of ${cap}. Extra pass/fail conversions are not allowed across the degree.`
      : `Binary conversions: ${used}/${cap} used across the degree, ${remaining} remaining.`,
    over
      ? `מספר ההמרות לבינארי (${used}) חורג ממכסת התואר (${cap}). לא ניתן להמיר קורסים נוספים לעובר/לא עובר בתואר. (נכון לתשפ"ו)`
      : `המרות לבינארי: נוצלו ${used}/${cap} בתואר, נותרו ${remaining}. (נכון לתשפ"ו)`,
    { used, cap, remaining, over, group }
  );
};

// -------------------------------------------------------------------
// PKM-025: Honors 25% binary cap (NON-BLOCKING)
// -------------------------------------------------------------------
// Domain §6: a student stays an honors (rector/dean) candidate ONLY if the
// binary-converted course HOURS are ≤ 25% of the year's course hours
// (MILUIM_CONFIG.BINARY_GRADE.EXCELLENCE_MAX_PERCENT). Over-converting loses
// honors eligibility — the app must WARN. This is WARNING/INFO ONLY and must
// NEVER ERROR (honors is not a graduation requirement).
//
// There is no per-course "is binary" flag in the schema (kept additive), so we
// estimate the binary-converted hours from the cumulative miluimBinaryUsed
// counter × the average weekly hours of the current academic year's courses,
// compared against that year's total course hours. With no binary usage this is
// always INFO (nothing converted → 0%).

export const ruleMiluimHonorsBinary: RegulationRule = (ctx: RuleContext) => {
  const binaryUsed = Math.max(0, ctx.miluimBinaryUsed ?? 0);
  const year = ctx.academicYear;

  // Courses for the relevant year (or all, if academic year is unknown), that
  // carry weekly-hours data. Retake duplicates are fine — they reflect real load.
  const yearCourses = ctx.userCourses.filter(
    (uc) =>
      (year == null || uc.plannedYear === year) &&
      (uc.course.weeklyHours ?? 0) > 0
  );
  const totalHours = yearCourses.reduce(
    (sum, uc) => sum + (uc.course.weeklyHours ?? 0),
    0
  );
  const courseCount = yearCourses.length;
  const avgHours = courseCount > 0 ? totalHours / courseCount : 0;
  // Estimated binary-converted hours (cannot exceed the year's total hours).
  const binaryHours = Math.min(binaryUsed * avgHours, totalHours);

  const { percent, cap, over } = honorsBinaryStatus(binaryHours, totalHours);
  const pct = Math.round(percent);

  // No conversions or no hours data → neutral INFO (nothing to warn about).
  if (binaryUsed === 0 || totalHours === 0) {
    return result(
      "PKM-025",
      "Honors Binary 25% Cap",
      "מגבלת 25% בינארי להצטיינות",
      true,
      "INFO",
      binaryUsed === 0
        ? `No courses converted to binary this year — honors eligibility unaffected (cap ${cap}% of course hours).`
        : `Year course hours unknown — cannot evaluate the ${cap}% honors binary cap.`,
      binaryUsed === 0
        ? `לא הומרו קורסים לבינארי השנה — אין השפעה על זכאות להצטיינות (מגבלה ${cap}% משעות הקורסים). (נכון לתשפ"ו)`
        : `שעות הקורסים השנתיות אינן ידועות — לא ניתן להעריך את מגבלת ה-${cap}% להצטיינות. (נכון לתשפ"ו)`,
      { binaryUsed, percent: pct, cap, over: false, totalHours, binaryHours }
    );
  }

  return result(
    "PKM-025",
    "Honors Binary 25% Cap",
    "מגבלת 25% בינארי להצטיינות",
    // Over the 25% line loses honors eligibility — WARNING, never ERROR.
    !over,
    over ? "WARNING" : "INFO",
    over
      ? `Binary-converted course hours are ~${pct}% of this year's course hours, above the ${cap}% honors cap — you may lose rector/dean honors eligibility.`
      : `Binary-converted course hours are ~${pct}% of this year's course hours, within the ${cap}% honors cap.`,
    over
      ? `שעות הקורסים שהומרו לבינארי הן כ-${pct}% משעות הקורסים השנתיות, מעל מגבלת ה-${cap}% להצטיינות — ייתכן אובדן זכאות להצטיינות דיקן/רקטור. (נכון לתשפ"ו)`
      : `שעות הקורסים שהומרו לבינארי הן כ-${pct}% משעות הקורסים השנתיות, בטווח מגבלת ה-${cap}% להצטיינות. (נכון לתשפ"ו)`,
    { binaryUsed, percent: pct, cap, over, totalHours, binaryHours }
  );
};
