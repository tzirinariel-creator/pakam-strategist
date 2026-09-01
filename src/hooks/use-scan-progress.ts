"use client";

// =========================================================================
// One clock for every AI scanner
// =========================================================================
// Ariel: "קריאת 3010 איטית". The 3010 form, the grade sheet, the syllabus and
// the assistant's photo upload each had their own `scanning` boolean and their
// own frozen label, so the same wait had to be explained four times — and had
// been explained zero times. The grade sheet is the worst of them: it is the
// longest document, so it is the longest wait, and it was the wait with the
// least on screen.
//
// The stage strings live in `scan-progress.ts` (pure, testable); this is only
// the timer that drives them.

import { useState, useEffect, useCallback } from "react";
import { scanProgressCopy, type ScanStage, type ScanSubject } from "@/lib/scan-progress";

export function useScanProgress(isHe: boolean, subject: ScanSubject = "form") {
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState<ScanStage>("prepare");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!scanning) return;
    const started = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [scanning]);

  const start = useCallback(() => {
    setStage("prepare");
    setScanning(true);
  }, []);
  const stop = useCallback(() => setScanning(false), []);

  return { scanning, start, stop, setStage, elapsed, ...scanProgressCopy(stage, elapsed, isHe, subject) };
}
