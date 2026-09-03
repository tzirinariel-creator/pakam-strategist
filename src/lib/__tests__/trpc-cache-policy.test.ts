import { describe, it, expect } from "vitest";
import { trpcCacheControl } from "@/lib/trpc-cache-policy";

const PRIVATE = "private, no-store";
const q = (paths?: string[], errorCount = 0) =>
  trpcCacheControl({ paths, type: "query", errorCount });

describe("מה נכנס לקאש משותף", () => {
  it("הקטלוג לבדו — נשמר בקצה", () => {
    expect(q(["course.list"])).toContain("s-maxage=600");
    expect(q(["course.list"])).toContain("public");
  });

  // זו הבדיקה שבאמת חשובה. httpBatchLink מאחד שאילתות, ואצווה שמכילה גם
  // נתיב אישי חייבת להישאר private — אחרת גיליון הציונים של סטודנט נשמר
  // בפרוקסי של הקמפוס. זה הבאג שברירת המחדל נכתבה כדי למנוע.
  it("אצווה מעורבת נשארת פרטית — גם אם הקטלוג בתוכה", () => {
    expect(q(["course.list", "user.getProfile"])).toBe(PRIVATE);
    expect(q(["plan.getUserPlan", "course.list"])).toBe(PRIVATE);
  });

  it("כל נתיב אישי — פרטי", () => {
    for (const p of ["user.getProfile", "plan.getCredits", "schedule.getExamSchedule"])
      expect(q([p])).toBe(PRIVATE);
  });

  it("מוטציה לא נשמרת לעולם", () => {
    expect(trpcCacheControl({ paths: ["course.list"], type: "mutation", errorCount: 0 })).toBe(PRIVATE);
  });

  it("שגיאה לא נשמרת — אחרת נקבע כשל לעשר דקות", () => {
    expect(q(["course.list"], 1)).toBe(PRIVATE);
  });

  it("בלי נתיבים — פרטי, כי אי-אפשר לדעת מה בפנים", () => {
    expect(q(undefined)).toBe(PRIVATE);
    expect(q([])).toBe(PRIVATE);
  });
});
