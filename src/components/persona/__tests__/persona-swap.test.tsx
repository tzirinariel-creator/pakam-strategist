// @vitest-environment jsdom
// =========================================================================
// The zero-flash swap is a CONTRACT ACROSS THREE FILES, and a broken link is
// invisible in review: the head script in app/layout.tsx stamps
// data-pk-persona on <html> before first paint, globals.css hides the wrong
// branch, and <PersonaSwap> renders both. Any one of them drifting silently
// restores the bug it exists to prevent — the King's name and crown painting
// for a Referent user on every cold load of a server-rendered screen (the FAB
// and the loaders are in the SSR HTML).
// =========================================================================
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PersonaSwap } from "@/components/persona/use-persona";
import { PERSONA_ATTR, PERSONA_KEY } from "@/lib/persona";

afterEach(() => cleanup());

const globalsCss = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const rootLayout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("PersonaSwap — both branches ship, CSS picks one", () => {
  it("renders BOTH advisors, each tagged for the stylesheet", () => {
    const { container } = render(<PersonaSwap king="המלך" referent="הרפרנט" />);
    const king = container.querySelector(".pk-persona-king");
    const referent = container.querySelector(".pk-persona-referent");
    expect(king).toHaveTextContent("המלך");
    expect(referent).toHaveTextContent("הרפרנט");
  });
});

describe("the swap's two other halves are still wired", () => {
  it("globals.css hides the wrong branch, and defaults to the King without the attribute", () => {
    expect(globalsCss).toContain(`[${PERSONA_ATTR}="referent"] .pk-persona-king`);
    expect(globalsCss).toContain(`:root:not([${PERSONA_ATTR}="referent"]) .pk-persona-referent`);
    // display:contents keeps the visible branch out of the parent's flex layout.
    expect(globalsCss).toMatch(/\.pk-persona-king,\s*\n\.pk-persona-referent\s*\{\s*\n\s*display: contents;/);
  });

  it("the head script stamps the choice before first paint, from the same key", () => {
    expect(rootLayout).toContain(PERSONA_ATTR);
    expect(rootLayout).toContain(PERSONA_KEY);
    // …and its failure mode is the documented default, never an unset attribute.
    expect(rootLayout).toContain(`setAttribute("${PERSONA_ATTR}","king")`);
  });
});
