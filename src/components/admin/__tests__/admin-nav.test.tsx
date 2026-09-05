// @vitest-environment jsdom
// =========================================================================
// הלשונית הפעילה — הדבר היחיד ב-AdminNav שאפשר לטעות בו
// =========================================================================
// "/admin" הוא תחילית של "/admin/sync" ושל "/admin/moderation", אז השוואה
// נאיבית עם startsWith/includes מדליקה את "סקירה" בכל אחד משלושת המסכים.
// ובכיוון השני, next-intl מוסיף קידומת שפה ("/he/admin"), אז השוואה מדויקת
// עם ה-href לא מדליקה כלום.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

let pathname = "/he/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { AdminNav } from "../admin-nav";

const activeLabel = () =>
  screen.getAllByRole("link").find((a) => a.getAttribute("aria-current") === "page")?.textContent?.trim();

beforeEach(() => cleanup());

describe("AdminNav — הלשונית הפעילה", () => {
  it("על /he/admin מודגשת הסקירה בלבד", () => {
    pathname = "/he/admin";
    render(<AdminNav />);
    expect(activeLabel()).toBe("סקירה");
  });

  it("על /he/admin/sync מודגש הסנכרון — לא הסקירה", () => {
    pathname = "/he/admin/sync";
    render(<AdminNav />);
    expect(activeLabel()).toBe("סנכרון קטלוג");
  });

  it("על /he/admin/moderation מודגשת המודרציה", () => {
    pathname = "/he/admin/moderation";
    render(<AdminNav />);
    expect(activeLabel()).toBe("מודרציה");
  });

  it("סלאש בסוף לא משנה כלום", () => {
    pathname = "/he/admin/";
    render(<AdminNav />);
    expect(activeLabel()).toBe("סקירה");
  });

  it("בדיוק לשונית אחת פעילה בכל רגע", () => {
    for (const p of ["/he/admin", "/he/admin/sync", "/he/admin/moderation"]) {
      cleanup();
      pathname = p;
      render(<AdminNav />);
      const active = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
      expect(active).toHaveLength(1);
    }
  });

  it("שלושת המסכים נגישים מכל אחד מהם", () => {
    pathname = "/he/admin/sync";
    render(<AdminNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/admin", "/admin/moderation", "/admin/sync"]);
  });
});
