import { describe, it, expect } from "vitest";
import {
  annotateAll,
  buildBatchAddPlan,
  buildDegreeState,
  compareAnnotated,
  courseFit,
  filterCounts,
  matchesFilter,
  offeredIn,
  pruneSelection,
  requirementFit,
  summarizeSelection,
  type BatchCourse,
  type DegreeState,
} from "@/lib/batch-course-select";

function course(over: Partial<BatchCourse> & { id: string; code: string }): BatchCourse {
  return {
    discipline: "PHILOSOPHY",
    canCountAs: [],
    courseType: "ELECTIVE",
    credits: 4,
    isMandatory: false,
    semesterOffered: ["FALL", "SPRING"],
    prerequisites: [],
    ...over,
  };
}

function state(over: Partial<DegreeState> = {}): DegreeState {
  return {
    focusArea: "ECONOMICS",
    disciplineGaps: { PHILOSOPHY: 6, ECONOMICS: 10 },
    seminarGap: 4,
    englishGap: 1,
    plannedCourseIds: new Set<string>(),
    ...over,
  };
}

const NO_CODES = new Set<string>();

describe("requirementFit", () => {
  it("reports the discipline gap a course closes", () => {
    const fit = requirementFit(course({ id: "a", code: "0651-1010" }), state());
    expect(fit).toEqual({ kind: "discipline", discipline: "PHILOSOPHY", remaining: 6 });
  });

  it("returns null when that discipline is already satisfied", () => {
    const fit = requirementFit(
      course({ id: "a", code: "0651-1010" }),
      state({ disciplineGaps: { ECONOMICS: 10 } })
    );
    expect(fit).toBeNull();
  });

  it("picks the LARGEST open gap among canCountAs options", () => {
    const c = course({
      id: "a",
      code: "0651-1010",
      discipline: "PHILOSOPHY",
      canCountAs: ["ECONOMICS"],
    });
    // PHILOSOPHY is short 6, ECONOMICS short 10 → say the one further away.
    expect(requirementFit(c, state())?.discipline).toBe("ECONOMICS");
  });

  it("falls back to the seminar bucket when no discipline gap applies", () => {
    const c = course({
      id: "s",
      code: "0651-3001",
      discipline: "PPE_CORE",
      courseType: "SEMINAR",
    });
    expect(requirementFit(c, state())).toEqual({ kind: "seminar", remaining: 4 });
  });

  it("does not claim the seminar bucket once it is full", () => {
    const c = course({ id: "s", code: "0651-3001", discipline: "PPE_CORE", courseType: "SEMINAR" });
    expect(requirementFit(c, state({ seminarGap: 0 }))).toBeNull();
  });

  it("reports English as COURSES missing, not credits", () => {
    const c = course({ id: "e", code: "0900-1000", discipline: "GENERAL", courseType: "ENGLISH" });
    expect(requirementFit(c, state({ englishGap: 2 }))).toEqual({ kind: "english", remaining: 2 });
  });
});

describe("offeredIn", () => {
  it("respects an explicit semester list", () => {
    const c = course({ id: "a", code: "x", semesterOffered: ["SPRING"] });
    expect(offeredIn(c, "SPRING")).toBe(true);
    expect(offeredIn(c, "FALL")).toBe(false);
  });

  it("treats an EMPTY list as 'offered' rather than hiding the course", () => {
    // A blank scraped field must not shrink the catalog during bidding week.
    const c = course({ id: "a", code: "x", semesterOffered: [] });
    expect(offeredIn(c, "FALL")).toBe(true);
    expect(offeredIn(c, "SUMMER")).toBe(true);
  });
});

describe("courseFit", () => {
  const opts = { targetSemester: "FALL", hasConflict: false, plannedCourseCodes: NO_CODES };

  it("marks a course already in the plan as unselectable", () => {
    const c = course({ id: "dup", code: "0651-1010" });
    const fit = courseFit(c, state({ plannedCourseIds: new Set(["dup"]) }), opts);
    expect(fit.alreadyPlanned).toBe(true);
    expect(fit.selectable).toBe(false);
    // …and it must not be advertised as closing anything.
    expect(fit.closes).toBeNull();
  });

  it("keeps a CLASHING course selectable — a clash is information, not a veto", () => {
    const fit = courseFit(course({ id: "a", code: "x" }), state(), {
      ...opts,
      hasConflict: true,
    });
    expect(fit.hasConflict).toBe(true);
    expect(fit.selectable).toBe(true);
  });

  it("keeps a course with an unmet prerequisite selectable (PPE exemption)", () => {
    const c = course({ id: "a", code: "1011-2020", prerequisites: ["1011-1010"] });
    const fit = courseFit(c, state(), opts);
    expect(fit.missingPrereqs).toEqual(["1011-1010"]);
    expect(fit.selectable).toBe(true);
  });

  it("clears the prerequisite note once the prereq is in the plan", () => {
    const c = course({ id: "a", code: "1011-2020", prerequisites: ["1011-1010"] });
    const fit = courseFit(c, state(), {
      ...opts,
      plannedCourseCodes: new Set(["1011-1010"]),
    });
    expect(fit.missingPrereqs).toEqual([]);
  });

  it("flags a mandatory course that is nowhere in the plan", () => {
    const c = course({ id: "m", code: "1011-1010", isMandatory: true });
    expect(courseFit(c, state(), opts).isMandatoryUnplanned).toBe(true);
  });

  it("does not flag a mandatory course already planned", () => {
    const c = course({ id: "m", code: "1011-1010", isMandatory: true });
    const fit = courseFit(c, state({ plannedCourseIds: new Set(["m"]) }), opts);
    expect(fit.isMandatoryUnplanned).toBe(false);
  });

  it("recognises the focus area through canCountAs too", () => {
    const c = course({ id: "f", code: "x", discipline: "LAW", canCountAs: ["ECONOMICS"] });
    expect(courseFit(c, state(), opts).isFocusArea).toBe(true);
  });

  it("has no focus-area opinion when the student picked none", () => {
    const c = course({ id: "f", code: "x", discipline: "ECONOMICS" });
    expect(courseFit(c, state({ focusArea: null }), opts).isFocusArea).toBe(false);
  });
});

describe("ranking and ordering", () => {
  const opts = {
    targetSemester: "FALL",
    conflictCourseIds: new Set<string>(["clash"]),
    plannedCourseCodes: NO_CODES,
  };

  const catalog: BatchCourse[] = [
    course({ id: "plain", code: "0000-0001", discipline: "LAW" }),
    course({ id: "clash", code: "0000-0002", discipline: "PHILOSOPHY" }),
    course({ id: "mand", code: "0000-0003", discipline: "PHILOSOPHY", isMandatory: true }),
    course({ id: "focus", code: "0000-0004", discipline: "ECONOMICS" }),
    course({ id: "offseason", code: "0000-0005", discipline: "PHILOSOPHY", semesterOffered: ["SPRING"] }),
    course({ id: "done", code: "0000-0006", discipline: "LAW" }),
  ];

  it("puts mandatory-and-unplanned first and already-planned last", () => {
    const annotated = annotateAll(
      catalog,
      state({ plannedCourseIds: new Set(["done"]), disciplineGaps: { PHILOSOPHY: 6, ECONOMICS: 10 } }),
      opts
    );
    const order = annotated.map((a) => a.course.id);
    expect(order[0]).toBe("mand");
    expect(order[order.length - 1]).toBe("done");
    // A course not taught next semester sinks below the ordinary ones.
    expect(order.indexOf("offseason")).toBeGreaterThan(order.indexOf("plain"));
  });

  it("sorts a clashing course below an equivalent clash-free one", () => {
    const annotated = annotateAll(catalog, state(), opts);
    const ids = annotated.map((a) => a.course.id);
    // "clash" and "mand" both close PHILOSOPHY; the clash-free mandatory wins.
    expect(ids.indexOf("mand")).toBeLessThan(ids.indexOf("clash"));
  });

  it("is a total, stable order — equal ranks tie-break on code", () => {
    const a = { course: course({ id: "a", code: "0000-0002" }), fit: { rank: 4 } } as never;
    const b = { course: course({ id: "b", code: "0000-0001" }), fit: { rank: 4 } } as never;
    expect(compareAnnotated(a, b)).toBeGreaterThan(0);
    expect(compareAnnotated(b, a)).toBeLessThan(0);
  });

  it("produces the same order on repeated runs (no render-to-render reshuffle)", () => {
    const once = annotateAll(catalog, state(), opts).map((a) => a.course.id);
    const twice = annotateAll([...catalog].reverse(), state(), opts).map((a) => a.course.id);
    expect(twice).toEqual(once);
  });
});

describe("filters", () => {
  const opts = {
    targetSemester: "FALL",
    conflictCourseIds: new Set<string>(["clash"]),
    plannedCourseCodes: NO_CODES,
  };
  const catalog: BatchCourse[] = [
    course({ id: "mand", code: "0000-0001", discipline: "PHILOSOPHY", isMandatory: true }),
    course({ id: "focus", code: "0000-0002", discipline: "ECONOMICS" }),
    course({ id: "clash", code: "0000-0003", discipline: "LAW" }),
    course({ id: "plain", code: "0000-0004", discipline: "LAW" }),
  ];
  const annotated = annotateAll(catalog, state({ disciplineGaps: { PHILOSOPHY: 6, ECONOMICS: 10 } }), opts);

  it("'all' shows everything", () => {
    expect(annotated.filter((a) => matchesFilter(a.fit, "all"))).toHaveLength(4);
  });

  it("'needed' shows only courses closing an open requirement", () => {
    const ids = annotated.filter((a) => matchesFilter(a.fit, "needed")).map((a) => a.course.id);
    expect(new Set(ids)).toEqual(new Set(["mand", "focus"]));
  });

  it("'mandatory' shows only unplanned mandatory courses", () => {
    const ids = annotated.filter((a) => matchesFilter(a.fit, "mandatory")).map((a) => a.course.id);
    expect(ids).toEqual(["mand"]);
  });

  it("'focus' follows the student's focus area", () => {
    const ids = annotated.filter((a) => matchesFilter(a.fit, "focus")).map((a) => a.course.id);
    expect(ids).toEqual(["focus"]);
  });

  it("'clear' drops clashing and off-semester courses", () => {
    const ids = annotated.filter((a) => matchesFilter(a.fit, "clear")).map((a) => a.course.id);
    expect(ids).not.toContain("clash");
    expect(ids).toHaveLength(3);
  });

  it("filterCounts matches what each filter actually returns", () => {
    const counts = filterCounts(annotated);
    expect(counts.all).toBe(4);
    expect(counts.needed).toBe(2);
    expect(counts.mandatory).toBe(1);
    expect(counts.focus).toBe(1);
    expect(counts.clear).toBe(3);
  });
});

const pick = (list: ReturnType<typeof annotateAll>, ...ids: string[]) =>
  ids.map((id) => list.find((a) => a.course.id === id)!).filter(Boolean);

describe("summarizeSelection", () => {
  const opts = {
    targetSemester: "FALL",
    conflictCourseIds: new Set<string>(["clash"]),
    plannedCourseCodes: NO_CODES,
  };
  const catalog = [
    course({ id: "a", code: "0000-0001", credits: 4, discipline: "PHILOSOPHY" }),
    course({ id: "clash", code: "0000-0002", credits: 2.5, discipline: "LAW" }),
    course({ id: "c", code: "0000-0003", credits: 3.5, discipline: "LAW" }),
  ];
  const annotated = annotateAll(catalog, state({ disciplineGaps: { PHILOSOPHY: 6 } }), opts);

  it("counts nothing for an empty selection", () => {
    expect(summarizeSelection([])).toEqual({
      count: 0,
      credits: 0,
      conflicts: 0,
      closesRequirements: 0,
    });
  });

  it("sums ש״ס without float drift", () => {
    const s = summarizeSelection(pick(annotated, "clash", "c"));
    expect(s.count).toBe(2);
    expect(s.credits).toBe(6); // 2.5 + 3.5, not 5.999999999999999
  });

  it("reports how many of the picked courses clash and how many close a gap", () => {
    const s = summarizeSelection(pick(annotated, "a", "clash"));
    expect(s.conflicts).toBe(1);
    expect(s.closesRequirements).toBe(1);
  });

  it("counts a course once even if it is in the selection twice", () => {
    const twice = pick(annotated, "a", "a");
    expect(summarizeSelection(twice).count).toBe(1);
  });
});

describe("buildBatchAddPlan", () => {
  const opts = {
    targetSemester: "FALL",
    conflictCourseIds: new Set<string>(),
    plannedCourseCodes: NO_CODES,
  };
  const catalog = [
    course({ id: "a", code: "0000-0001" }),
    course({ id: "b", code: "0000-0002" }),
    course({ id: "already", code: "0000-0003" }),
  ];

  it("emits one addCourse payload per selected course, in tick order", () => {
    const annotated = annotateAll(catalog, state(), opts);
    const items = buildBatchAddPlan(pick(annotated, "b", "a"), {
      plannedYear: 2,
      plannedSemester: "FALL",
    });
    expect(items).toEqual([
      { courseId: "b", plannedYear: 2, plannedSemester: "FALL" },
      { courseId: "a", plannedYear: 2, plannedSemester: "FALL" },
    ]);
  });

  it("carries the TARGET year/semester onto every item, not the course's own", () => {
    const annotated = annotateAll(catalog, state(), opts);
    const items = buildBatchAddPlan(pick(annotated, "a"), {
      plannedYear: 3,
      plannedSemester: "SPRING",
    });
    expect(items[0]).toEqual({ courseId: "a", plannedYear: 3, plannedSemester: "SPRING" });
  });

  it("never fires a request for a course already in the plan", () => {
    const annotated = annotateAll(catalog, state({ plannedCourseIds: new Set(["already"]) }), opts);
    const items = buildBatchAddPlan(pick(annotated, "a", "already"), {
      plannedYear: 1,
      plannedSemester: "FALL",
    });
    expect(items.map((i) => i.courseId)).toEqual(["a"]);
  });

  it("emits at most one item per course id", () => {
    const annotated = annotateAll(catalog, state(), opts);
    const items = buildBatchAddPlan(pick(annotated, "a", "a"), {
      plannedYear: 1,
      plannedSemester: "FALL",
    });
    expect(items).toHaveLength(1);
  });

  it("returns an empty batch for an empty selection", () => {
    expect(buildBatchAddPlan([], { plannedYear: 1, plannedSemester: "FALL" })).toEqual([]);
  });
});

describe("pruneSelection", () => {
  const opts = {
    targetSemester: "FALL",
    conflictCourseIds: new Set<string>(),
    plannedCourseCodes: NO_CODES,
  };
  const catalog = [course({ id: "a", code: "0000-0001" }), course({ id: "b", code: "0000-0002" })];

  it("keeps a selection untouched when nothing changed", () => {
    const list = annotateAll(catalog, state(), opts);
    const sel = pick(list, "a", "b");
    expect(pruneSelection(sel, list).map((x) => x.course.id)).toEqual(["a", "b"]);
  });

  it("drops a course that became un-addable while the picker was open", () => {
    const before = annotateAll(catalog, state(), opts);
    const sel = pick(before, "a", "b");
    // Another tab adds "a" to the plan; the picker refetches.
    const after = annotateAll(catalog, state({ plannedCourseIds: new Set(["a"]) }), opts);
    expect(pruneSelection(sel, after).map((x) => x.course.id)).toEqual(["b"]);
  });

  it("KEEPS a selected course that is no longer in the visible list", () => {
    // The regression this exists for: ticking three courses and then typing in
    // the search box refetches the catalog. While that request is in flight the
    // annotated list is EMPTY, and a prune that treated 'absent' as 'deselect'
    // silently threw the batch away.
    const before = annotateAll(catalog, state(), opts);
    const sel = pick(before, "a", "b");
    expect(pruneSelection(sel, []).map((x) => x.course.id)).toEqual(["a", "b"]);
    // …and narrowing the list to one course keeps the other one ticked.
    const narrowed = annotateAll([catalog[0]!], state(), opts);
    expect(pruneSelection(sel, narrowed).map((x) => x.course.id)).toEqual(["a", "b"]);
  });

  it("REFRESHES a kept entry from the new annotation", () => {
    const before = annotateAll(catalog, state(), opts);
    const sel = pick(before, "a");
    expect(sel[0]!.fit.hasConflict).toBe(false);
    // The target semester's schedule finally loads and "a" turns out to clash.
    const after = annotateAll(catalog, state(), {
      ...opts,
      conflictCourseIds: new Set(["a"]),
    });
    const pruned = pruneSelection(sel, after);
    expect(pruned[0]!.fit.hasConflict).toBe(true);
    expect(summarizeSelection(pruned).conflicts).toBe(1);
  });

  it("collapses a duplicated entry", () => {
    const list = annotateAll(catalog, state(), opts);
    expect(pruneSelection(pick(list, "a", "a"), list)).toHaveLength(1);
  });
});

describe("buildDegreeState", () => {
  it("turns the credit breakdown into open gaps only", () => {
    const s = buildDegreeState({
      disciplineStatus: [
        { discipline: "PHILOSOPHY", earned: 12, required: 18 },
        { discipline: "ECONOMICS", earned: 30, required: 30 },
        { discipline: "LAW", earned: 40, required: 18 },
      ],
      seminarEarned: 8,
      seminarRequired: 12,
      englishCoursesEarned: 1,
      englishCoursesRequired: 2,
      focusArea: "PHILOSOPHY",
      plannedCourseIds: ["x", "y"],
    });
    expect(s.disciplineGaps).toEqual({ PHILOSOPHY: 6 });
    expect(s.seminarGap).toBe(4);
    expect(s.englishGap).toBe(1);
    expect(s.focusArea).toBe("PHILOSOPHY");
    expect(s.plannedCourseIds.has("x")).toBe(true);
  });

  it("never reports a negative gap", () => {
    const s = buildDegreeState({
      disciplineStatus: [{ discipline: "LAW", earned: 40, required: 18 }],
      seminarEarned: 20,
      seminarRequired: 12,
      englishCoursesEarned: 5,
      englishCoursesRequired: 2,
      focusArea: null,
      plannedCourseIds: [],
    });
    expect(s.disciplineGaps).toEqual({});
    expect(s.seminarGap).toBe(0);
    expect(s.englishGap).toBe(0);
  });

  it("keeps half-credit gaps exact", () => {
    const s = buildDegreeState({
      disciplineStatus: [{ discipline: "PHILOSOPHY", earned: 12.3, required: 18 }],
      seminarEarned: 0,
      seminarRequired: 0,
      englishCoursesEarned: 0,
      englishCoursesRequired: 0,
      focusArea: null,
      plannedCourseIds: [],
    });
    expect(s.disciplineGaps.PHILOSOPHY).toBe(5.7);
  });
});
