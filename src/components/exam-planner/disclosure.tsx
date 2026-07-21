"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Disclosure — collapsed secondary tools so they don't shout on first load ──
export function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="animate-stagger-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-2.5 text-sm font-medium text-foreground/65 transition-colors hover:bg-foreground/[0.04]">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {title}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
