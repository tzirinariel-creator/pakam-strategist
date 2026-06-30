import { describe, it, expect } from "vitest";
import { buildStudyPlanCsv, type GanttTask } from "@/lib/excel-export";

function task(over: Partial<GanttTask> & { date: Date }): GanttTask {
  return {
    title: "t",
    courseCode: "C1",
    courseLabel: "מאקרו",
    taskType: "study",
    color: null,
    hours: null,
    ...over,
  };
}

describe("buildStudyPlanCsv", () => {
  it("emits a header row in Hebrew when isHe", () => {
    const csv = buildStudyPlanCsv([], true);
    expect(csv.split("\r\n")[0]).toBe("תאריך,יום,קורס / מסלול,סוג,פירוט,שעות");
  });

  it("uses CRLF line endings (Excel-friendly)", () => {
    const csv = buildStudyPlanCsv([task({ date: new Date(2026, 6, 1) })], false);
    expect(csv).toContain("\r\n");
  });

  it("orders rows by date ascending regardless of input order", () => {
    const csv = buildStudyPlanCsv(
      [
        task({ date: new Date(2026, 6, 10), title: "later" }),
        task({ date: new Date(2026, 6, 2), title: "earlier" }),
      ],
      false
    );
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("earlier");
    expect(lines[2]).toContain("later");
  });

  it("escapes commas and quotes per RFC-4180", () => {
    const csv = buildStudyPlanCsv(
      [task({ date: new Date(2026, 6, 1), title: 'Macro, "final" review' })],
      false
    );
    // comma + embedded quotes → field wrapped in quotes, inner quotes doubled.
    expect(csv).toContain('"Macro, ""final"" review"');
  });

  it("translates the task type and keeps Hebrew course labels intact", () => {
    const csv = buildStudyPlanCsv(
      [task({ date: new Date(2026, 6, 1), taskType: "exam", courseLabel: "סטטיסטיקה" })],
      true
    );
    expect(csv).toContain("מבחן");
    expect(csv).toContain("סטטיסטיקה");
  });
});
