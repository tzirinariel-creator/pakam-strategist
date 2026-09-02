"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "bg-background border border-border text-foreground shadow-lg rounded-xl",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
          success: "border-emerald-500/30 [&>svg]:text-status-green",
          error: "border-red-500/30 [&>svg]:text-status-red",
        },
      }}
      offset={80} // offset from bottom to clear mobile nav
    />
  );
}
