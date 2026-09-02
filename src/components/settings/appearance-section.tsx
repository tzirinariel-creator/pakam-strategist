"use client";

import { useState, useEffect } from "react";
import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { SectionCard } from "./section-card";
import { usePersona } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";

// ---------------------------------------------------------------
// Appearance Section
// ---------------------------------------------------------------

export function AppearanceSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const isHe = locale === "he";
  const { theme, setTheme } = useUIStore();
  // The setting belongs to whichever advisor the student chose — naming the
  // King here to a Referent user was one of the incoherent surfaces (13.8).
  const { persona } = usePersona();
  const labels = personaLabels(persona, isHe);

  // The advisor's proactive suggestion (note #12) — a global opt-out kept in
  // localStorage (pk-proactive-off). ON = the advisor may surface one critical
  // gap when you open them; OFF = they stay quiet until asked.
  const [proactiveOn, setProactiveOn] = useState(true);
  useEffect(() => {
    try {
      setProactiveOn(!localStorage.getItem("pk-proactive-off"));
    } catch {
      /* storage unavailable — default on */
    }
  }, []);
  const toggleProactive = () => {
    setProactiveOn((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.removeItem("pk-proactive-off");
        else localStorage.setItem("pk-proactive-off", "1");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <SectionCard
      icon={Palette}
      title={t("appearance")}
      description={t("appearanceDescription")}
    >
      <div className="flex flex-col gap-5">
        {/* Theme toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground/80">
            {t("theme")}
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setTheme("system")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-all",
                theme === "system"
                  ? "border-accent-brand/30 bg-accent-brand-muted text-accent-brand"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Monitor className="size-5" />
              <span className="text-sm font-medium">{t("systemMode")}</span>
            </button>
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-all",
                theme === "light"
                  ? "border-accent-brand/30 bg-accent-brand-muted text-accent-brand"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Sun className="size-5" />
              <span className="text-sm font-medium">{t("lightMode")}</span>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-all",
                theme === "dark"
                  ? "border-accent-brand/30 bg-accent-brand-muted text-accent-brand"
                  : "border-border bg-card text-foreground/60 hover:border-foreground/30"
              )}
            >
              <Moon className="size-5" />
              <span className="text-sm font-medium">{t("darkMode")}</span>
            </button>
          </div>
        </div>

        {/* King proactive suggestion — global opt-out (note #12) */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <label className="text-sm font-medium text-foreground/80">
              {isHe ? `${labels.short} יציף פער קריטי כשתפתחו אותו` : `Let ${labels.short} surface one critical gap when I open the panel`}
            </label>
            <p className="mt-0.5 text-xs text-foreground/60">
              {isHe ? `אם משהו אצלכם דורש טיפול — ${labels.short} יגיד את זה ברגע שתפתחו אותו. הוא אף פעם לא קופץ מעצמו באמצע העבודה.` : `When you open ${labels.short} and there is something that needs attention — you hear about it. Only on entry, never mid-flow.`}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={proactiveOn}
            aria-label={isHe ? `${labels.short} יציף פער קריטי כשתפתחו אותו` : `Let ${labels.short} surface one critical gap when I open the panel`}
            onClick={toggleProactive}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              proactiveOn ? "bg-accent-brand" : "bg-foreground/20",
            )}
          >
            <span
              className={cn(
                "inline-block size-4 rounded-full bg-white transition-transform",
                proactiveOn ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1",
              )}
            />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
