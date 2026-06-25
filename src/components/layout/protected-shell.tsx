"use client";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import type { ReactNode } from "react";

export function ProtectedShell({ children }: { children: ReactNode }) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <main
      className={cn(
        "min-h-screen pt-16 pb-20 md:pb-0 transition-all duration-300",
        sidebarCollapsed ? "md:ps-16" : "md:ps-64"
      )}
    >
      <div className="p-2 sm:p-4 md:p-6">{children}</div>
    </main>
  );
}
