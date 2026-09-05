"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { LayoutDashboard, ShieldCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One nav for the three admin screens.
 *
 * Before this, /admin/sync and /admin/moderation were two islands with no way
 * between them and no way back — you reached them from the sidebar or not at
 * all, and /admin itself was a 404. An owner opening the back office should
 * see how many rooms it has.
 */
const TABS = [
  { href: "/admin", labelHe: "סקירה", icon: LayoutDashboard },
  { href: "/admin/moderation", labelHe: "מודרציה", icon: ShieldCheck },
  { href: "/admin/sync", labelHe: "סנכרון קטלוג", icon: RefreshCw },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  // The locale prefix ("/he/admin") is not in the hrefs above — next-intl's Link
  // adds it — so compare on the suffix, and match the overview exactly so it
  // isn't lit up on every child route.
  const current = (href: string) =>
    href === "/admin"
      ? /\/admin\/?$/.test(pathname)
      : pathname.endsWith(href);

  return (
    <nav
      aria-label="ניווט מסכי ניהול"
      className="animate-stagger-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-border/50 bg-card/40 p-1.5"
    >
      {TABS.map((t) => {
        const active = current(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent-brand text-accent-brand-fg"
                : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground/90",
            )}
          >
            <t.icon className="size-4 shrink-0" />
            {t.labelHe}
          </Link>
        );
      })}
    </nav>
  );
}
