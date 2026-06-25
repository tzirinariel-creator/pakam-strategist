"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

function applyThemeClass(resolved: "dark" | "light") {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
}

function resolveTheme(theme: "dark" | "light" | "system"): "dark" | "light" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  // system — follow OS preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * ThemeProvider — syncs the Zustand theme state to the DOM.
 * Adds/removes the "dark" class on <html> so CSS variables in globals.css activate.
 * Supports "system" mode that follows the OS prefers-color-scheme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  // Sync theme to DOM whenever it changes
  useEffect(() => {
    applyThemeClass(resolveTheme(theme));
  }, [theme]);

  // Listen for OS theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      applyThemeClass(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  return <>{children}</>;
}
