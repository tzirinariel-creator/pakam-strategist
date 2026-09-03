"use client";

import { UnofficialNotice } from "@/components/layout/unofficial-notice";
import { useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import {
  Gavel,
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
  Shield,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/react";
import { usePersona } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";

const MOBILE_NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "planner", href: "/planner", icon: GraduationCap },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "regulations", href: "/regulations", icon: Scale },
] as const;

/**
 * On a phone, ten of the app's fourteen destinations live behind this one
 * button — and they were a flat 3-column grid of ten equal tiles. The
 * constitution names exactly this failure ("features that exist but are not
 * discovered"), and the #41 note in this file is the same bug caught once
 * already: mentoring was built and unreachable.
 *
 * Ten identical tiles is not a menu, it is a wall. Grouping them costs no
 * screen and gives the eye somewhere to land.
 *
 *   HIG · Layout: "Group related items to help people find the information
 *   they want... use negative space, background shapes, colors, materials, or
 *   separator lines to show when elements are related."
 *
 * The three groups answer three different questions a student actually
 * arrives with: what do I take, where do I stand, and who else is here.
 */
const MORE_MENU_GROUPS = [
  {
    key: "studies",
    he: "מה ללמוד",
    en: "What to take",
    items: [
      // First while the round is near — it is the one screen with a deadline.
      { key: "bidding", href: "/bidding", icon: Gavel },
      { key: "catalog", href: "/catalog", icon: BookOpen },
      { key: "examPlanner", href: "/exam-planner", icon: CalendarClock },
    ],
  },
  {
    key: "standing",
    he: "איפה אני עומד",
    en: "Where I stand",
    items: [
      { key: "record", href: "/record", icon: FolderOpen },
      { key: "graduation", href: "/graduation", icon: Calculator },
      { key: "miluim", href: "/miluim", icon: Shield },
    ],
  },
  {
    key: "around",
    he: "מסביב",
    en: "Around",
    items: [
      // Ariel, #10, 2.9: "אין טף טאב שמוביל לחלון הזה עם המלך?"
      //
      // There was not. /mentor — the advisor's own full screen — appeared in
      // the desktop sidebar and NOWHERE in this file: not in the four tabs, not
      // in this menu. On a phone the only way to it was the floating button,
      // which opens a panel rather than the page. So the King's screen was
      // reachable on a laptop and unreachable on the device most students use.
      //
      // That is the exact failure the comment above this constant describes and
      // claims to have fixed once already for mentoring. It happened again to
      // the app's headline feature, which is what makes it worth a door of its
      // own rather than a footnote: first in the group, before the guide.
      { key: "mentor", href: "/mentor", icon: Crown },
      // #41 — the social layer gets ONE door on a phone too. Before this,
      // /cohort was here and /mentors existed only in the desktop sidebar, so
      // mentoring was literally unreachable on mobile; השושלת links to both.
      { key: "lineage", href: "/lineage", icon: Users2 },
      { key: "guide", href: "/guide", icon: Compass },
      { key: "settings", href: "/settings", icon: Settings },
    ],
  },
] as const;

/** נגזר מהקבוצות כדי שאיחוד המפתחות יישמר — `t(item.key)` צריך אותו. */
type MoreItem = (typeof MORE_MENU_GROUPS)[number]["items"][number];

const MORE_MENU_ITEMS: readonly MoreItem[] = MORE_MENU_GROUPS.flatMap(
  (g) => g.items as readonly MoreItem[],
);

export function MobileNav() {
  const t = useTranslations("nav");
  const isHe = useLocale() === "he";

  // הסטודנט מחליף את היועץ לרפרנט, והכפתור הצף, הברכה שלו, עמוד /mentor
  // ורשימת הכלים במדריך — כולם עוברים לומר "הרפרנט". רק מגירת "עוד" בטלפון,
  // שהיא **הדרך היחידה** להגיע לעמוד היועץ מהטלפון, המשיכה לומר "המלך
  // הפילוסוף", כי היא קוראת מחרוזת קבועה מקובץ השפה. מסך אחד שלא הסכים עם
  // כל השאר על מי מדבר איתך.
  const { persona } = usePersona();
  const advisorName = personaLabels(persona, isHe).name;
  const label = (key: string) => (key === "mentor" ? advisorName : t(key));
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Mirror the desktop sidebar's gate: the מילואים hub shows only for
  // reservists (audit 22.7 — mobile used to show it to every student while
  // desktop hid it from non-reservists).
  const { data: profile } = api.user.getProfile.useQuery();
  // #6 — the profile group only describes the CURRENT semester, so a student
  // who served last semester (or only ever recorded it as a per-semester row)
  // lost the hub — and with it the 3010 upload, the one place that would have
  // told the app about their service. Any recorded semester counts too. Same
  // query key the status bar already uses, so this costs no extra request.
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
  const menuItems = MORE_MENU_ITEMS.filter((i) => i.key !== "miluim" || isReservist);

  // Check if active page is in the "more" menu
  const isMoreActive = menuItems.some((item) =>
    pathname.includes(item.href)
  );

  return (
    <>
      {/*
        z-[70] ולא z-[60]: ה-FAB של המלך יושב על z-[65], אז במשך כל הזמן
        שהמגירה הזאת הייתה פתוחה הוא צף מעליה — מעל הרקע המעומעם, מכסה את
        שורת "לא אתר רשמי", ולחיץ בזמן שהתפריט אמור לחסום הכול.
        HIG · Modality: חוויה מודאלית מונעת אינטראקציה עם שאר האפליקציה.
        נמדד ב-375px, לא נראה בעין בדסקטופ כי שם ה-FAB במקום אחר.
      */}
      {moreOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
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

              {/* Items, grouped */}
              <div className="p-3">
                {MORE_MENU_GROUPS.map((group) => {
                  const items = group.items.filter(
                    (i) => i.key !== "miluim" || isReservist,
                  );
                  if (items.length === 0) return null;
                  return (
                    <div key={group.key} className="mb-2 last:mb-0">
                      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {isHe ? group.he : group.en}
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {items.map((item) => {
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
                              <span className="text-center leading-tight">{label(item.key)}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 21.8 — the "not an official site" line lives in the desktop
                  sidebar, which does not exist on a phone. Ariel uses the app
                  mostly on mobile, so on mobile the notice simply never
                  appeared. The "עוד" drawer is where the chrome-level things
                  live, so it belongs here. */}
              <div className="border-t border-border px-2 py-2">
                <UnofficialNotice variant="compact" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar — pads its own height out past the iOS home indicator
          via --safe-bottom, and keeps the tap row a clean 64px above it (#20). */}
      {/* Lookit reference (21.8): the bottom navigation is a FLOATING pill
          inset from the edges, not a bar welded to the bottom of the screen.
          The safe-area padding moves to the wrapper so the pill itself clears
          the iOS home indicator without growing its own height — the 64px tap
          row the #20 note fixed is preserved exactly. */}
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(var(--safe-bottom)+0.5rem)] pt-2 md:hidden">
        <nav className="nav-pill">
        {/* min-h, not h: at 320px ("בדיקת מסלול") the labels wrap to two lines
            and the item grows to 70px. With a fixed h-16 the row overflowed the
            bar and the second line was cut off by the bottom of the screen
            (measured: item bottom 815px in an 812px viewport). min-h keeps the
            bar exactly 64px everywhere it already fits. */}
        <div className="flex min-h-16 items-center justify-around">
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
              <span>{label(item.key)}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          // #17/#36 — on a phone every screen beyond the four in the bar lives
          // behind this button. The tour has to point at it, or the record,
          // the exam board and the community are simply never discovered.
          data-tour="nav-more"
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
      </div>
    </>
  );
}
