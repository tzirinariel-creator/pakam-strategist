"use client";

import { UnofficialNotice } from "@/components/layout/unofficial-notice";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import {
  Gavel,
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
  Handshake,
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
  bidding: Gavel,
  settings: Settings,
  mentor: PhilosopherKingIcon,
  guide: Compass,
  cohort: Users2,
  mentors: Handshake,
  lineage: Users2,
  adminOverview: LayoutDashboard,
  adminModeration: ShieldCheck,
  adminSync: RefreshCw,
} as const;

// OPS3 — rendered only when getProfile.role === "admin"; the routes themselves
// are double-gated (admin layout redirect + adminProcedure 403).
const ADMIN_GROUP = [
  { key: "adminOverview", href: "/admin" },
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
    // Ariel: "אין איזה מסך ייעודי וזה גרוע". The round submits both semesters
    // at once and it is days away — it belongs in the primary loop, beside
    // planning, not behind it.
    { key: "bidding", href: "/bidding" },
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
  // Reference / one-read. #41 — תיק המחזור and חונכות used to sit here as two
  // peers sharing one icon and stating no relationship, which is exactly the
  // confusion the note describes. They now live behind השושלת, the page that
  // names the concept, explains the sharing contract and routes to both. Both
  // routes stay resolvable and are linked from there (and חונכות becomes
  // reachable on a phone for the first time — it was desktop-sidebar-only).
  [
    { key: "catalog", href: "/catalog" },
    { key: "lineage", href: "/lineage" },
    { key: "guide", href: "/guide" },
  ],
] as const;

// Pinned to the bottom of the sidebar, separated from the main nav.
const SETTINGS_ITEM = { key: "settings", href: "/settings" } as const;

// Routes that belong to a nav item but aren't its href — without this the two
// pages behind השושלת would leave the whole nav with nothing highlighted.
const EXTRA_ACTIVE_PATHS: Partial<Record<keyof typeof NAV_ICONS, readonly string[]>> = {
  lineage: ["/cohort", "/mentors"],
};

export function Sidebar() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { data: profile } = api.user.getProfile.useQuery();
  const isAdmin = profile?.role === "admin";
  // The miluim hub shows only for reservists — everyone else keeps a clean nav.
  // #6 — but "reservist" was read off the CURRENT-semester group alone, so a
  // student who served in an earlier semester lost the hub (and with it the
  // 3010 upload, which is how you TELL the app about service in the first
  // place). Any recorded miluim semester counts. Same query key the status bar
  // already fetches, so no extra request.
  const { data: miluimSemesters } = api.user.listMiluimSemesters.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
    enabled: !!profile,
  });
  const isReservist = Boolean(
    profile &&
      (profile.miluimGroup !== "NONE" ||
        profile.miluimCareerService ||
        (miluimSemesters?.length ?? 0) > 0),
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
    const isActive =
      pathname.includes(item.href) ||
      (EXTRA_ACTIVE_PATHS[item.key] ?? []).some((p) => pathname.includes(p));

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
            {/* "פכ״מ" הוא שם התואר, לא שם האפליקציה. האייקון על מסך הבית
                אומר "פכמון", לשונית הדפדפן אומרת "פכמון", מסך ההתחברות ודף
                הנחיתה אומרים "פכמון" — ורק המקום שבו הסטודנט מבלה בפועל
                אמר משהו אחר. שם שמשתנה בין המסכים הוא שם שלא נתפס. */}
            <span className="font-display text-lg font-bold text-foreground/80">
              {isRTL ? "פכמון" : "Pakamon"}
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
              // #17/#36 — tour anchors. The product tour used to cover the home
              // tab and nothing else, so a new user never learned that the app
              // HAS an academic file, an exam board, or a community — let alone
              // how the screens relate. Each nav tier is now spotlightable.
              data-tour={`nav-group-${i}`}
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

      {/* Not an official university site — stated in the chrome, so it is
          present on every screen rather than only where someone thought to
          put it. Hidden when collapsed, where there is no room for words. */}
      {!sidebarCollapsed && (
        <div className="border-t border-sidebar-border px-2 py-2">
          <UnofficialNotice variant="compact" />
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center rounded-lg p-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={
            locale === "he"
              ? sidebarCollapsed
                ? "הרחיבו את התפריט"
                : "כווצו את התפריט"
              : sidebarCollapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
        >
          <CollapseIcon className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
