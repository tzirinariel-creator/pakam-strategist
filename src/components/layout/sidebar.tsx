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
  Compass,
  Shield,
  ShieldCheck,
  RefreshCw,
  Users2,
} from "lucide-react";
import { PhilosopherKingIcon } from "@/components/ui/philosopher-king-icon";
import { api } from "@/lib/trpc/react";
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
  miluim: Shield,
  regulations: Scale,
  settings: Settings,
  mentor: PhilosopherKingIcon,
  guide: Compass,
  cohort: Users2,
  adminModeration: ShieldCheck,
  adminSync: RefreshCw,
} as const;

// OPS3 — rendered only when getProfile.role === "admin"; the routes themselves
// are double-gated (admin layout redirect + adminProcedure 403).
const ADMIN_GROUP = [
  { key: "adminModeration", href: "/admin/moderation" },
  { key: "adminSync", href: "/admin/sync" },
] as const;

// Grouped by tier instead of a flat 10-peer list (the "tab-jungle"). The King
// (mentor) is dropped from the sidebar — it already floats as a FAB on every
// screen — but the /mentor route stays resolvable. Every route is preserved.
const NAV_GROUPS: readonly (readonly { key: keyof typeof NAV_ICONS; href: string }[])[] = [
  // The primary loop: where am I → plan it → verify it.
  [
    { key: "dashboard", href: "/dashboard" },
    { key: "planner", href: "/planner" },
    { key: "regulations", href: "/regulations" },
  ],
  // The academic file — log completed grades + forecast the final score.
  [
    { key: "record", href: "/record" },
    { key: "graduation", href: "/graduation" },
  ],
  // Seasonal / schedule spokes.
  [
    { key: "examPlanner", href: "/exam-planner" },
    { key: "calendar", href: "/calendar" },
  ],
  // Reference / one-read.
  [
    { key: "catalog", href: "/catalog" },
    { key: "cohort", href: "/cohort" },
    { key: "guide", href: "/guide" },
  ],
] as const;

// Pinned to the bottom of the sidebar, separated from the main nav.
const SETTINGS_ITEM = { key: "settings", href: "/settings" } as const;

export function Sidebar() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { data: profile } = api.user.getProfile.useQuery();
  const isAdmin = profile?.role === "admin";
  // The miluim hub shows only for reservists — everyone else keeps a clean nav.
  const isReservist = Boolean(
    profile && (profile.miluimGroup !== "NONE" || profile.miluimCareerService),
  );

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
          {NAV_GROUPS.map((group, i) => (
            <div
              key={i}
              className={cn("space-y-1", i > 0 && "mt-2 border-t border-sidebar-border/60 pt-2")}
            >
              {group.map((item) => renderNavItem(item))}
              {/* מילואים — only for reservists, inside the academic-file group */}
              {i === 1 && isReservist && renderNavItem({ key: "miluim", href: "/miluim" })}
            </div>
          ))}
          {isAdmin && (
            <div className="mt-2 space-y-1 border-t border-sidebar-border/60 pt-2">
              {ADMIN_GROUP.map((item) => renderNavItem(item))}
            </div>
          )}
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
