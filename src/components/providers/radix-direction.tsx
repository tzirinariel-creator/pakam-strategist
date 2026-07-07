"use client";

import { Direction } from "radix-ui";

/**
 * Radix reads direction from ITS OWN context, never from the DOM — without
 * this provider every Radix primitive (Select dropdowns, menus, tooltips…)
 * lays itself out LTR even on the Hebrew site. One provider at the locale
 * root fixes all of them, current and future. (notes #40/#42/#44)
 */
export function RadixDirection({
  dir,
  children,
}: {
  dir: "rtl" | "ltr";
  children: React.ReactNode;
}) {
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
