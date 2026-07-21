"use client";

import { lazy, Suspense } from "react";

// PERF1: this component sits in the protected LAYOUT, so a static
// react-markdown import would ship remark/rehype on every page's first load.
// It lazy-loads with the first LLM answer; until then the raw text shows.
const LazyMarkdown = lazy(() => import("react-markdown"));

export function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-line">{children}</p>}>
      <LazyMarkdown>{children}</LazyMarkdown>
    </Suspense>
  );
}
