// @vitest-environment jsdom
// =========================================================================
// #43 — the Group-C benefits block read "פטור ש״ס 0/ 10 / קורסים בינאריים 0/ 5":
// the used/cap pair lived in two adjacent spans, so every linearization of the
// panel (copy, screen reader, plain-text export) glued the number to the slash.
// The counter is now ONE explicitly-LTR run with real spaces around the slash.
// =========================================================================
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { Shield } from "lucide-react";
import { QuotaCard } from "@/components/miluim/quota-card";

describe("QuotaCard — the used/cap counter (#43)", () => {
  it("reads '0 / 10' as text, not '0/ 10'", () => {
    const { container } = render(
      <QuotaCard icon={Shield} label="פטור ש״ס — בכל התואר" used={0} cap={10} hint="" pending={false} isHe />,
    );
    expect(container.textContent).toContain("0 / 10");
    expect(container.textContent).not.toContain("0/ 10");
  });

  it("the counter stays in an explicitly-LTR container so 10/5 never flips in RTL", () => {
    const { container } = render(
      <QuotaCard icon={Shield} label="קורסים בינאריים" used={3} cap={5} hint="" pending={false} isHe />,
    );
    const ltr = container.querySelector('[dir="ltr"]')!;
    expect(ltr.textContent).toBe("3 / 5");
  });

  it("the steppers are still wired (a label-bearing pair, only when editable)", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <QuotaCard icon={Shield} label="פטור" used={2} cap={10} hint="" pending={false} isHe onChange={onChange} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(2);
    rerender(
      <QuotaCard icon={Shield} label="פטור" used={2} cap={10} hint="" pending={false} isHe />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
