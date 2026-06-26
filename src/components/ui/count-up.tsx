"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  /** animation duration in ms */
  duration?: number;
  /** decimal places; defaults to 0 for integers, 1 otherwise */
  decimals?: number;
  className?: string;
}

/**
 * Animates a number from 0 → value on mount with an ease-out curve and
 * tabular figures (so the width doesn't jitter mid-count). Honors
 * prefers-reduced-motion by snapping straight to the final value.
 */
export function CountUp({ value, duration = 1000, decimals, className }: CountUpProps) {
  const places = decimals ?? (Number.isInteger(value) ? 0 : 1);
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(value)) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums lining-nums" }}>
      {(Number.isFinite(display) ? display : value).toFixed(places)}
    </span>
  );
}
