"use client";

import { useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  Scale,
  MoreHorizontal,
  Settings,
  BookOpen,
  Calendar,
  CalendarClock,
  Calculator,
  FolderOpen,
  Compass,
  X,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "planner", href: "/planner", icon: GraduationCap },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "regulations", href: "/regulations", icon: Scale },
] as const;

const MORE_MENU_ITEMS = [
  { key: "examPlanner", href: "/exam-planner", icon: CalendarClock },
  { key: "catalog", href: "/catalog", icon: BookOpen },
  { key: "cohort", href: "/cohort", icon: Users2 },
  { key: "record", href: "/record", icon: FolderOpen },
  { key: "graduation", href: "/graduation", icon: Calculator },
  { key: "guide", href: "/guide", icon: Compass },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

export function MobileNav() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Check if active page is in the "more" menu
  const isMoreActive = MORE_MENU_ITEMS.some((item) =>
    pathname.includes(item.href)
  );

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMore}
          />

          {/* Bottom drawer */}
          <div className="absolute bottom-[calc(4rem+var(--safe-bottom))] start-0 end-0 animate-in slide-in-from-bottom-4 duration-200">
            <div className="mx-3 mb-2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground/70">
                  {t("more")}
                </span>
                <button
                  onClick={closeMore}
                  aria-label={t("close")}
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Items */}
              <div className="grid grid-cols-3 gap-1 p-3">
                {MORE_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.includes(item.href);

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={closeMore}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs transition-colors min-h-[44px]",
                        isActive
                          ? "bg-accent-brand-muted text-accent-brand font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-center leading-tight">{t(item.key)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar — pads its own height out past the iOS home indicator
          via --safe-bottom, and keeps the tap row a clean 64px above it (#20). */}
      <nav className="fixed bottom-0 start-0 end-0 z-50 border-t border-border bg-background/80 pb-[var(--safe-bottom)] backdrop-blur-md md:hidden">
        <div className="flex h-16 items-center justify-around">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.includes(item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={closeMore}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-2 text-xs transition-colors min-h-[44px] min-w-[44px] justify-center",
                isActive
                  ? "text-accent-brand font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={cn(
            "flex flex-col items-center gap-0.5 px-4 py-2 text-xs transition-colors min-h-[44px] min-w-[44px] justify-center",
            moreOpen || isMoreActive
              ? "text-accent-brand font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>{t("more")}</span>
        </button>
        </div>
      </nav>
    </>
  );
}
