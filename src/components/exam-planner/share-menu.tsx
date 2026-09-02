"use client";

import { ChevronDown, Share2, FileSpreadsheet, CalendarPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Share menu — Radix DropdownMenu (portal), so a transformed/stacking
// ancestor can never trap it under sibling cards again (#34). ICS primary,
// CSV secondary; RTL comes from the RadixDirection provider.
export function ShareMenu({ isHe, onXlsx, onIcs, onCsv }: { isHe: boolean; onXlsx: () => void; onIcs: () => void; onCsv: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90">
        <Share2 className="size-4" />
        {isHe ? "שיתוף / ייצוא" : "Share / export"}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl">
        <DropdownMenuItem onSelect={onXlsx} className="gap-2 text-sm font-medium text-foreground/85">
          <FileSpreadsheet className="size-4 text-status-green" />
          {isHe ? "אקסל — לוח שבועי לתלייה" : "Excel — a weekly grid to print"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onIcs} className="gap-2 text-sm text-foreground/80">
          <CalendarPlus className="size-4 text-accent-brand" />
          {isHe ? "הוסיפו ליומן Google" : "Add to Google Calendar"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCsv} className="gap-2 text-xs text-foreground/60">
          <FileSpreadsheet className="size-3.5" />
          {isHe ? "טבלה פשוטה (CSV)" : "Plain table (CSV)"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
