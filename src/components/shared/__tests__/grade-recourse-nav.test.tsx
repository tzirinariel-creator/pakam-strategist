/** @vitest-environment jsdom */
// =========================================================================
// The three grade tools point at each other (22-12)
// =========================================================================
// Ariel: "אין בהכרח קו מחבר בין להחליט על מועד ב׳, לבין המרת בינארי, לבין
// סימולציה."
//
// It was literal. A grep across the three components found no link between
// them at all — three answers to one situation, on three routes, and a student
// had to already know the other two existed to reach them.
//
// What this pins is the map property, not the styling: every screen shows all
// three, the one you are on is NOT a link (otherwise it is three more buttons
// rather than a map), and the other two are.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GradeRecourseNav } from "@/components/shared/grade-recourse-nav";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// The miluim group drives whether binary conversion exists for this student.
// The real keys are GROUP_A / GROUP_B / GROUP_C / GROUP_G / NONE. Writing "B"
// here produced a benefit of null for every group and made twelve assertions
// fail at once — a useful reminder that a mocked value is a claim about the
// system, and a wrong one fails loudly only when something asserts on it.
let group = "GROUP_B";
vi.mock("@/lib/trpc/react", () => ({
  api: {
    user: {
      getProfile: { useQuery: () => ({ data: { miluimGroup: group }, isSuccess: true }) },
    },
  },
}));

afterEach(cleanup);

const ROUTES = ["/graduation", "/exam-planner", "/record"];
const OWN = { "moed-b": "/exam-planner", binary: "/record", simulator: "/graduation" } as const;

describe.each(["moed-b", "binary", "simulator"] as const)("on the %s screen", (current) => {
  it("names all three tools", () => {
    render(<GradeRecourseNav current={current} isHe />);
    expect(screen.getByText("סימולציית ציונים")).toBeInTheDocument();
    expect(screen.getByText("מועד ב׳")).toBeInTheDocument();
    expect(screen.getByText("המרה לבינארי")).toBeInTheDocument();
  });

  it("links to exactly the OTHER two", () => {
    const { container } = render(<GradeRecourseNav current={current} isHe />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toHaveLength(2);
    // No self-link: a map marks where you are, it does not offer to send you
    // to the page you are already reading.
    expect(hrefs).not.toContain(OWN[current]);
    expect(new Set(hrefs)).toEqual(new Set(ROUTES.filter((r) => r !== OWN[current])));
  });

  it("marks the current screen as 'you are here'", () => {
    render(<GradeRecourseNav current={current} isHe />);
    expect(screen.getByText("אתם כאן")).toBeInTheDocument();
  });

  it("says WHEN each tool applies, not just its name", () => {
    // The three are not interchangeable; a bare list of three links would
    // imply they are. The binary row in particular has to carry its cost.
    render(<GradeRecourseNav current={current} isHe />);
    expect(screen.getByText(/המכסה מוגבלת/)).toBeInTheDocument();
  });
});

describe("English", () => {
  it("renders without leaking Hebrew", () => {
    const { container } = render(<GradeRecourseNav current="binary" isHe={false} />);
    expect(container.textContent).toMatch(/Grade simulator/);
    expect(container.textContent).not.toMatch(/[֐-׿]/);
  });
});

// =========================================================================
// Binary conversion is a MILUIM benefit, and this map must not invent one
// =========================================================================
// Caught on the live page minutes after the component first shipped. Mounted
// unconditionally on /record it listed "המרה לבינארי" for every student —
// but the advisor beside it renders only for groups B/C/G, because retroactive
// pass/fail is a reservist benefit. A and NONE never get it.
//
// Offering a student a route they do not have is the same class of error as
// showing a number without a source: it reads as fact and it is not.

describe("a student with no binary benefit", () => {
  beforeEach(() => { group = "NONE"; });
  afterEach(() => { group = "GROUP_B"; });

  it("is not offered binary conversion", () => {
    render(<GradeRecourseNav current="simulator" isHe />);
    expect(screen.queryByText("המרה לבינארי")).not.toBeInTheDocument();
  });

  it("still gets the two routes they DO have", () => {
    const { container } = render(<GradeRecourseNav current="simulator" isHe />);
    expect(screen.getByText("מועד ב׳")).toBeInTheDocument();
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/exam-planner",
    ]);
  });

  it("counts honestly in the heading", () => {
    render(<GradeRecourseNav current="simulator" isHe />);
    expect(screen.getByText(/שתי דרכים/)).toBeInTheDocument();
    expect(screen.queryByText(/שלוש דרכים/)).not.toBeInTheDocument();
  });

  it("renders nothing at all on the binary screen", () => {
    // There is no "here" to be, and nothing on that screen to connect from.
    const { container } = render(<GradeRecourseNav current="binary" isHe />);
    expect(container.textContent).toBe("");
  });
});

describe("group G — credits rather than courses — still counts as having it", () => {
  beforeEach(() => { group = "GROUP_G"; });
  afterEach(() => { group = "GROUP_B"; });

  it("keeps the binary route", () => {
    render(<GradeRecourseNav current="simulator" isHe />);
    expect(screen.getByText("המרה לבינארי")).toBeInTheDocument();
  });
});
