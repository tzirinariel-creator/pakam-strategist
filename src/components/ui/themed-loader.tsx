"use client";

import { useLocale } from "next-intl";
import { GraduationCap } from "lucide-react";

interface ThemedLoaderProps {
  /** Optional custom className */
  className?: string;
}

export function ThemedLoader({ className }: ThemedLoaderProps) {
  const locale = useLocale();
  const isHe = locale === "he";

  return (
    <div
      className={`flex min-h-[40vh] flex-col items-center justify-center gap-4 ${className ?? ""}`}
    >
      <div className="relative">
        <div className="h-16 w-16 animate-spin rounded-full border-[3px] border-foreground/8 border-t-foreground/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <GraduationCap className="h-7 w-7 text-foreground/40" />
        </div>
      </div>
      <p className="text-sm text-foreground/40">
        {isHe ? "טוען את התוכנית שלך..." : "Loading your plan..."}
      </p>
    </div>
  );
}
