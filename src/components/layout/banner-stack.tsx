"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps the top notification bars (demo banner + miluim status bar) into a
 * single sticky unit and publishes their combined height as the CSS variable
 * `--banner-offset` on <html>.
 *
 * Why: the sidebar (logo) and top bar are `fixed top-0`. The bars used to be
 * independently `sticky top-0`, so with a higher z-index they rendered ON TOP
 * of the sidebar logo — covering it (#7 "hides the logo"). Now the fixed
 * chrome offsets its `top` by `--banner-offset`, so it always sits *below* the
 * bars, whichever bars happen to be present (both are conditional & client-
 * rendered). A ResizeObserver keeps the offset correct as bars mount/unmount.
 */
export function BannerStack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--banner-offset", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--banner-offset");
    };
  }, []);

  return (
    <div ref={ref} className="sticky top-0 z-[60]">
      {children}
    </div>
  );
}
