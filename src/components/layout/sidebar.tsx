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
  CalendarClock,
  Calculator,
  FolderOpen,
  Bot,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  planner: GraduationCap,
  catalog: BookOpen,
  calendar: Calendar,
  examPlanner: CalendarClock,
  record: FolderOpen,
  graduation: Calculator,
  regulations: Scale,
  settings: Settings,
  mentor: Bot,
  guide: Compass,
} as const;

const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard" },
  { key: "planner", href: "/planner" },
  { key: "catalog", href: "/catalog" },
  { key: "calendar", href: "/calendar" },
  { key: "examPlanner", href: "/exam-planner" },
  { key: "record", href: "/record" },
  { key: "graduation", href: "/graduation" },
  { key: "regulations", href: "/regulations" },
  { key: "mentor", href: "/mentor" },
  { key: "guide", href: "/guide" },
] as const;

// Pinned to the bottom of the sidebar, separated from the main nav.
const SETTINGS_ITEM = { key: "settings", href: "/settings" } as const;

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

  const renderNavItem = (item: { key: keyof typeof NAV_ICONS; href: string }) => {
    const Icon = NAV_ICONS[item.key];
    const isActive = pathname.includes(item.href);

    return (
      <Tooltip key={item.key}>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
              isActive
                ? "bg-accent-brand-muted text-accent-brand font-semibold"
                : "text-sidebar-foreground/70 hover:bg-foreground/5 hover:text-sidebar-foreground",
              sidebarCollapsed && "justify-center px-2"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                isActive && "text-accent-brand"
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
  };

  return (
    <aside
      className={cn(
        "fixed start-0 z-40 flex flex-col border-e border-sidebar-border bg-[color-mix(in_oklch,var(--sidebar)_82%,transparent)] backdrop-blur-md transition-all duration-300",
        "top-[var(--banner-offset,0px)] h-[calc(100vh_-_var(--banner-offset,0px))]",
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
            <span className="font-display text-lg font-bold text-foreground/80">
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
          {NAV_ITEMS.map((item) => renderNavItem(item))}
        </nav>

        {/* Settings — pinned at the bottom, separated from the main nav */}
        <div className="border-t border-sidebar-border px-2 pt-2 pb-1">
          {renderNavItem(SETTINGS_ITEM)}
        </div>
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
