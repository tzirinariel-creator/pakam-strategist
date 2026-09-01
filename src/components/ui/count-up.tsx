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
    // A hidden tab never gets a rAF callback, so the count never advances and
    // the number stays frozen at its starting 0. Caught while auditing the
    // planner: "0% מהתואר הושלמו" sat directly above "73 הושלמו" for over a
    // minute — the same card contradicting itself.
    //
    // It self-heals the moment the tab is focused, so no student stares at it
    // for long. It is fixed anyway because the failure mode is a WRONG NUMBER,
    // and a number that is only true once an animation has run is not a number
    // this app is allowed to print. Decoration must never gate a fact.
    const hidden = typeof document !== "undefined" && document.hidden;
    if (reduce || hidden || !Number.isFinite(value)) {
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

  // If the tab is hidden when this mounts and shown later, the effect above has
  // already snapped to the value — but a tab that is hidden AFTER mounting can
  // freeze mid-count, so the final value is restored on the way back.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onShow = () => {
      if (!document.hidden) {
        setDisplay(value);
        fromRef.current = value;
      }
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [value]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums lining-nums" }}>
      {(Number.isFinite(display) ? display : value).toFixed(places)}
    </span>
  );
}
