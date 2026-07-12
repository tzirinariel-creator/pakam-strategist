"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Moon, Sun, Monitor, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function TopBar() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { theme, toggleTheme, sidebarCollapsed } = useUIStore();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign-out failed:", e);
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  };

  return (
    <header
      className={cn(
        "fixed top-[var(--banner-offset,0px)] z-30 flex h-16 items-center justify-between bg-background/70 backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.06)] transition-all duration-300",
        "start-0 end-0 px-3 sm:px-6",
        sidebarCollapsed ? "md:start-16" : "md:start-64",
      )}
    >
      {/* Spacer — keeps the action cluster pinned to the inline-end on all sizes.
          Mobile navigation lives in the bottom nav bar, not here. */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle (system → light → dark) */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={
            theme === "dark"
              ? (locale === "he" ? "עבור למצב אוטומטי" : "Switch to auto mode")
              : theme === "light"
                ? (locale === "he" ? "עבור למצב כהה" : "Switch to dark mode")
                : (locale === "he" ? "עבור למצב בהיר" : "Switch to light mode")
          }
        >
          {theme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : theme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
        </button>

        {/* Logout */}
        <button
          onClick={handleSignOut}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          title={t("auth.logout")}
          aria-label={t("auth.logout")}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
