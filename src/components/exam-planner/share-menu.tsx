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
//
// Ariel, #7, 2.9: "בוא נבליט את זה שיש אופציה של אקסל כי זאת אופציה מדהימה!!
// בכללי הפיצרים היפים והחשובים צריכים להיות בולטים ואטרקטיביים לשימוש!!
// שלא יאבדו."
//
// The .xlsx is the best artifact this screen produces — three sheets, a weekly
// grid tinted by study hours, a printable agenda with tick-boxes — and it was
// the first line of a dropdown labelled "שיתוף / ייצוא". Nobody opens a share
// menu to discover a feature; you open it when you already know what you want.
// So the Excel gets its own button, beside the menu rather than inside it, and
// the menu keeps the calendar and the plain CSV. One extra button, and the
// thing worth showing off is the thing you can see.
export function ShareMenu({ isHe, onXlsx, onIcs, onCsv }: { isHe: boolean; onXlsx: () => void; onIcs: () => void; onCsv: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onXlsx}
        className="inline-flex items-center gap-1.5 rounded-lg border border-status-green/35 bg-status-green/10 px-3 py-2 text-sm font-semibold text-status-green transition-colors hover:bg-status-green/15"
      >
        <FileSpreadsheet className="size-4" />
        {isHe ? "הורידו כאקסל" : "Download as Excel"}
      </button>
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground/90">
        <Share2 className="size-4" />
        {isHe ? "שיתוף / ייצוא" : "Share / export"}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl">
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
    </div>
  );
}
