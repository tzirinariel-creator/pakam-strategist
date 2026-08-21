/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { WhatMovesMyAverage } from "../what-moves-my-average";
import type { UserCourseWithCourse } from "@/types/degree";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

let n = 0;
const c = (grade: number | null, credits = 4, code?: string) => {
  n++;
  return {
    id: `uc${n}`, courseId: `c${n}`,
    status: grade == null ? "PLANNED" : "COMPLETED",
    grade, isBinary: false, attemptNumber: 1,
    course: {
      id: `c${n}`, code: code ?? `1000-00${n}`, nameHe: `קורס ${n}`,
      courseType: "ELECTIVE", credits, discipline: "ECONOMICS",
    },
  } as unknown as UserCourseWithCourse;
};

describe("WhatMovesMyAverage", () => {
  it("names the resit label exactly once", () => {
    // It read "מועד ב׳ · מועד ב׳ · יום חמישי" live — describeSitting already
    // opens with the label and the row was adding its own.
    const { container } = render(
      <WhatMovesMyAverage courses={[c(70, 4, "0651-1007"), c(95), c(95)]} keepsHigherGrade={false} />,
    );
    // The term appears legitimately in three places — the row, the closing
    // caveat and the link — so counting occurrences tests nothing. What was
    // actually wrong is the doubled label inside one row.
    expect(container.textContent).not.toContain("מועד ב׳ · מועד ב׳");
  });

  it("prints how little each course weighs, beside its upside", () => {
    // Ranking levers without saying how short they are is selling something.
    const { container } = render(
      <WhatMovesMyAverage courses={[c(70), c(95), c(95)]} keepsHigherGrade={false} />,
    );
    expect(container.textContent).toMatch(/% מהממוצע/);
  });

  it("tells a reservist who keeps the higher sitting that nothing is at risk", () => {
    const { container } = render(
      <WhatMovesMyAverage courses={[c(70), c(95), c(95)]} keepsHigherGrade />,
    );
    expect(container.textContent).toContain("לא מסכן כלום");
  });

  it("warns everyone else that a resit replaces the first sitting", () => {
    const { container } = render(
      <WhatMovesMyAverage courses={[c(70), c(95), c(95)]} keepsHigherGrade={false} />,
    );
    expect(container.textContent).toContain("מחליף את מועד א׳");
  });

  it("renders nothing when no course can move the average", () => {
    const { container } = render(
      <WhatMovesMyAverage courses={[c(98), c(99)]} keepsHigherGrade={false} />,
    );
    expect(container.textContent).toBe("");
  });
});
