"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  Scale,
  Settings,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Calendar,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  planner: GraduationCap,
  catalog: BookOpen,
  calendar: Calendar,
  mentor: Bot,
  regulations: Scale,
  settings: Settings,
} as const;

const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard" },
  { key: "planner", href: "/planner" },
  { key: "catalog", href: "/catalog" },
  { key: "calendar", href: "/calendar" },
  { key: "mentor", href: "/mentor" },
  { key: "regulations", href: "/regulations" },
  { key: "settings", href: "/settings" },
] as const;

export function Sidebar() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const isRTL = locale === "he";
  const CollapseIcon = isRTL
    ? sidebarCollapsed
      ? ChevronLeft
      : ChevronRight
    : sidebarCollapsed
      ? ChevronRight
      : ChevronLeft;

  return (
    <aside
      className={cn(
        "fixed top-0 start-0 z-40 flex h-screen flex-col border-e border-sidebar-border bg-sidebar transition-all duration-300",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-heading text-lg font-bold text-foreground/80">
              {isRTL ? "פכ\"מ" : "PKM"}
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <TooltipProvider>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const isActive = pathname.includes(item.href);

            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-foreground/10 text-foreground/80 border-s-[3px] border-s-foreground"
                        : "text-sidebar-foreground/70 hover:bg-foreground/5 hover:text-sidebar-foreground border-s-[3px] border-transparent",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isActive && "text-foreground/80"
                      )}
                    />
                    {!sidebarCollapsed && <span>{t(item.key)}</span>}
                  </Link>
                </TooltipTrigger>
                {sidebarCollapsed && (
                  <TooltipContent
                    side={isRTL ? "left" : "right"}
                    className="bg-foreground text-primary-foreground font-medium"
                  >
                    {t(item.key)}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center rounded-lg p-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
