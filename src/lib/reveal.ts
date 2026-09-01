// =========================================================================
// Bring a just-arrived result into view — but only if it isn't already
// =========================================================================
// Ariel: "גלילה לתחתית אחרי העלאת סילבוס". The syllabus scanner sits inside a
// collapsed accordion ("עוד דרכים להוסיף תאריכים") at the bottom of the exam
// planner. Open it, upload, wait — and the extracted dates render BELOW the
// fold, inside that accordion. From where the student is standing the scan
// produced nothing at all, and the only way to find out otherwise is to scroll
// to the bottom of the page.
//
// The rule is deliberately narrow. Scrolling the page for someone is rude when
// they can already see the thing, and it fights them if they have started
// reading somewhere else. So: scroll ONLY when the element is genuinely out of
// the viewport, land it near the top rather than centring it (the result is a
// list — its first row is what matters), and honour reduced-motion.

export function revealIfOffscreen(el: HTMLElement | null): void {
  if (!el || typeof window === "undefined") return;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  // Already looking at it (or at its top edge) — leave the page alone.
  const visible = rect.top < vh - 40 && rect.bottom > 80;
  if (visible) return;

  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}
