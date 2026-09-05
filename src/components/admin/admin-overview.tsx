"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Users, UserPlus, Activity, BookOpen, RefreshCw,
  TrendingUp, Database, ShieldAlert, CalendarClock, GraduationCap,
  Shield, Sparkles, CheckCircle2, AlertTriangle, MessageSquare, Link2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { AdminNav } from "./admin-nav";
import { PageHeader } from "@/components/ui/page-header";
import { ThemedLoader } from "@/components/ui/themed-loader";
import { QueryErrorState } from "@/components/shared/query-error";
import { DISCIPLINE_CONFIG, MILUIM_CONFIG } from "@/lib/constants";
import { hebrewYearLabel } from "@/lib/academic-calendar";

// =========================================================================
// לוח הבקרה של בעל האפליקציה
// =========================================================================
// אריאל, 6.9: *"דשבורד אחורי… שאוכל להיכנס ממנו ולנהל ולראות מה קורה
// בשימוש באפליקציה בכל רגע בצורה אמינה ומלאה."*
//
// שני עקרונות שמכתיבים כל שורה במסך הזה:
//
// **כל מספר הוא ספירה, לא הערכה.** אין כאן חיזוי, אין "בערך", ואין מדד
// מורכב שאי-אפשר לאמת. כל מספר הוא COUNT על טבלה, וכתוב לידו מה נספר.
// לוח בקרה שמנחש גרוע מלוח בקרה שלא קיים — כי מחליטים לפיו.
//
// **אין ציונים ברמת הפרט.** רואים כמה ציונים הוזנו, לא מה הם. הסטודנטים
// העלו גיליונות לכלי תכנון, לא לצפייה. הגבול הזה מכוון, וכתוב על המסך
// כדי שיישאר.

const NUM = new Intl.NumberFormat("he-IL");
const n = (x: number) => NUM.format(x);

/** תאריך/שעה בעברית, בלי להמציא אזור זמן. */
function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `לפני ${s} שניות`;
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "לפני דקה" : `לפני ${m} דקות`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}

const dateHe = (iso: string) =>
  new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });

// ── אבני בניין ─────────────────────────────────────────────────────────

/** מספר גדול עם תווית ומשפט-הסבר. ההסבר הוא חלק מהמידע, לא קישוט. */
function Kpi({
  icon: Icon, label, value, hint, tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "green" | "amber" | "brand";
}) {
  const toneClass = {
    neutral: "text-foreground/85",
    green: "text-status-green",
    amber: "text-status-amber",
    brand: "text-accent-brand",
  }[tone];
  return (
    <div className="data-card flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-1.5 text-foreground/60">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={cn("font-display text-3xl font-bold tabular-nums", toneClass)} dir="ltr">
        {value}
      </div>
      <p className="text-[11px] leading-relaxed text-foreground/60">{hint}</p>
    </div>
  );
}

function Section({
  icon: Icon, title, subtitle, children, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("data-card space-y-4 p-5", className)}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-foreground/60" />
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-foreground/85">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-foreground/60">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** שורת מונה קטנה — תווית מימין, מספר משמאל, קו מפריד.
 *  אפס מעומעם בכוונה: ברשימה של שש-עשרה שורות, חצי מהן אפס בשבוע ההשקה,
 *  והעין צריכה למצוא את מה שכן קרה. האפס עדיין שם — הוא עובדה — רק שקט. */
function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  const isZero = value === 0;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/30 py-1.5 last:border-0">
      <span className={cn("min-w-0 text-xs", isZero ? "text-foreground/45" : "text-foreground/70")}>
        {label}
        {hint && <span className="ms-1 text-[10px] text-foreground/50">{hint}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-sm tabular-nums",
          isZero ? "font-normal text-foreground/40" : "font-semibold text-foreground/85",
        )}
        dir="ltr"
      >
        {typeof value === "number" ? n(value) : value}
      </span>
    </div>
  );
}

// ── המסך ───────────────────────────────────────────────────────────────

export function AdminOverview() {
  // 30 שניות: מספיק "חי" כדי לפתוח את המסך בזמן שהקישור מתפשט ולראות
  // את המונה זז, ומספיק נדיר כדי לא להעמיס על מסד שיושב בסידני.
  const [live, setLive] = useState(true);
  const q = api.admin.getOverview.useQuery(undefined, {
    refetchInterval: live ? 30_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // שעון מקומי — כדי ש"עודכן לפני X" יזוז גם בין רענונים.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  // ── חיות הספק, מ-/api/health ──────────────────────────────────────────
  // זו לא כפילות של הבדיקה הקיימת אלא שימוש בה: ה-endpoint כבר שולח בקשה
  // זעירה אמיתית לגוגל ושומר את התוצאה לחמש דקות, בדיוק כדי שדגימה תכופה
  // לא תשרוף מכסה. הסיבה שזה כאן: מודל מת מוריד את המלך ואת שני הסורקים —
  // חצי מהמוצר — ואת זה אריאל גילה בעבר רק כשמשתמש נתקע (3.9). מסך ניהול
  // שלא אומר את זה שולח אותו לגלות את זה שוב מהדרך הקשה.
  const [health, setHealth] = useState<
    { ok: boolean; db: boolean; ai?: { alive: boolean; respondingModel: string | null; lastStatus: number | null } } | null
  >(null);
  const [healthFailed, setHealthFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = await r.json();
        if (!cancelled) { setHealth(j); setHealthFailed(false); }
      } catch {
        if (!cancelled) setHealthFailed(true);
      }
    };
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const d = q.data;

  const funnelRows = useMemo(() => {
    if (!d) return [];
    const t = Math.max(1, d.funnel.registered);
    return [
      { label: "נרשמו", value: d.funnel.registered, note: "חשבון קיים" },
      { label: "הצהירו שנת פתיחה", value: d.funnel.declaredYear, note: "סיימו את שלב הפרופיל" },
      { label: "בנו תוכנית", value: d.funnel.withPlan, note: "לפחות קורס אחד שמור" },
      { label: "הזינו ציונים", value: d.funnel.withGrades, note: "לפחות ציון אחד" },
      { label: "חזרו ביום אחר", value: d.funnel.returned, note: "שינוי יותר מיממה אחרי ההרשמה" },
    ].map((r) => ({ ...r, pct: Math.round((r.value / t) * 100) }));
  }, [d]);

  if (q.isLoading) return <ThemedLoader />;
  if (q.isError || !d) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <AdminNav />
        <QueryErrorState what="לוח הבקרה" onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const maxDay = Math.max(1, ...d.signupsByDay.map((x) => x.count));
  const focusLabel = (k: string | null) =>
    k == null ? "עוד לא בחרו" : (DISCIPLINE_CONFIG[k as keyof typeof DISCIPLINE_CONFIG]?.nameHe ?? k);
  const miluimLabel = (k: string) =>
    k === "NONE" ? "ללא" : (MILUIM_CONFIG.GROUPS[k as keyof typeof MILUIM_CONFIG.GROUPS]?.nameHe?.split("—")[0]?.trim() ?? k);

  return (
    <div className="bg-mesh space-y-6 p-4 md:p-6">
      <AdminNav />

      <PageHeader
        icon={LayoutDashboard}
        title="לוח הבקרה"
        subtitle={`כל מספר כאן נספר עכשיו מהמסד · עודכן ${timeAgo(d.generatedAt)}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                live
                  ? "border-emerald-500/40 bg-emerald-500/10 text-status-green"
                  : "border-border/70 text-foreground/70 hover:bg-foreground/5",
              )}
            >
              <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-current" : "bg-current opacity-40")} />
              {live ? "מתעדכן כל 30 שניות" : "עדכון אוטומטי כבוי"}
            </button>
            <button
              type="button"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", q.isFetching && "animate-spin")} />
              רענון
            </button>
          </>
        }
      />

      {/* ── ארבעת המספרים שפותחים את היום ── */}
      <div className="animate-stagger-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Users} label="משתמשים רשומים" value={n(d.users.total)}
          hint={`מהם ${n(d.users.admins)} מנהלים`} tone="brand"
        />
        <Kpi
          icon={UserPlus} label="נרשמו ב-24 השעות" value={n(d.users.today)}
          hint={`${n(d.users.last7)} בשבוע האחרון · ${n(d.users.last30)} בחודש`}
          tone={d.users.today > 0 ? "green" : "neutral"}
        />
        <Kpi
          icon={Activity} label="בנו תוכנית" value={n(d.funnel.withPlan)}
          hint={`${Math.round((d.funnel.withPlan / Math.max(1, d.users.total)) * 100)}% מהנרשמים שמרו לפחות קורס אחד`}
        />
        <Kpi
          icon={BookOpen} label="שורות קורס שנשמרו" value={n(d.content.userCourses)}
          hint={`${n(d.content.gradedRows)} מהן עם ציון`}
        />
      </div>

      {/* ── הרשמות לפי יום ── */}
      <Section
        icon={TrendingUp}
        title="הרשמות · 30 הימים האחרונים"
        // הבהרה שנולדה מהמסך עצמו: הכרטיס למעלה סופר חלון מתגלגל של 24
        // שעות, והגרף סופר ימים קלנדריים. בערב שני המספרים נבדלים בצדק,
        // וזה נראה כמו סתירה למי שלא יודע. אז כתוב.
        subtitle="ימים קלנדריים לפי שעון ישראל — ולכן היום האחרון כאן יכול להיות שונה מ״נרשמו ב-24 השעות״ שלמעלה, שהוא חלון מתגלגל. עמודה ריקה היא יום בלי אף הרשמה, לא נתון חסר."
        className="animate-stagger-3"
      >
        {/* `h-full` על עמודת העטיפה הוא הדבר שגורם לגרף להיות גרף.
            בלעדיו `items-end` מכווץ כל עמודה לגובה התוכן, וגובה באחוזים
            נפתר מול הורה בגובה auto — כלומר אפס. הגרף רונדר כקופסה ריקה. */}
        <div
          className="flex h-32 items-end gap-[3px]"
          role="img"
          aria-label={`גרף הרשמות ל-30 יום: ${d.signupsByDay.filter((x) => x.count > 0).map((x) => `${x.date} — ${x.count}`).join(", ") || "אף הרשמה"}`}
        >
          {d.signupsByDay.map((x) => (
            <div
              key={x.date}
              className="group flex h-full flex-1 flex-col justify-end"
              title={`${x.date} · ${x.count}`}
            >
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  x.count > 0 ? "bg-accent-brand/70 group-hover:bg-accent-brand" : "bg-foreground/10",
                )}
                style={{ height: x.count > 0 ? `${Math.max(8, (x.count / maxDay) * 100)}%` : "3px" }}
              />
            </div>
          ))}
        </div>
        {d.signupsByDay.every((x) => x.count === 0) && (
          <p className="text-xs text-foreground/60">אף אחד לא נרשם ב-30 הימים האחרונים.</p>
        )}
        <div className="flex items-center justify-between text-[10px] text-foreground/55">
          <span>{dateHe(d.signupsByDay[0]!.date)}</span>
          <span>שיא יומי: <bdi dir="ltr">{n(maxDay)}</bdi></span>
          <span>{dateHe(d.signupsByDay[d.signupsByDay.length - 1]!.date)}</span>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── משפך ההפעלה ── */}
        <Section
          icon={Activity}
          title="משפך ההפעלה"
          subtitle="איפה אנשים נעצרים. כל שלב הוא עובדה במסד, לא פרשנות."
          className="animate-stagger-3"
        >
          <div className="space-y-3">
            {funnelRows.map((r, i) => {
              const prev = i > 0 ? funnelRows[i - 1]!.value : null;
              const drop = prev != null ? prev - r.value : null;
              return (
                <div key={r.label} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground/80">{r.label}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/70" dir="ltr">
                      {n(r.value)} · {r.pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/8">
                    <div
                      className={cn("h-full rounded-full transition-all", i === 0 ? "bg-accent-brand" : "bg-accent-brand/60")}
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-foreground/55">
                    {r.note}
                    {drop != null && drop > 0 && (
                      <span className="ms-1.5 text-status-amber">· נשרו <bdi dir="ltr">{n(drop)}</bdi> מהשלב הקודם</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-x-4 border-t border-border/30 pt-3">
            <Stat label="חיברו יומן Google" value={d.funnel.googleLinked} />
            <Stat label="הזינו מילואים" value={d.funnel.withMiluim} />
          </div>
        </Section>

        {/* ── מה הם העלו ── */}
        <Section
          icon={Database}
          title="מה הם העלו"
          subtitle="נפחי הנתונים שהמשתמשים יצרו. ספירות בלבד — תוכן אישי לא מוצג כאן."
          className="animate-stagger-3"
        >
          <div className="grid gap-x-5 sm:grid-cols-2">
            <div>
              <Stat label="שורות קורס" value={d.content.userCourses} />
              <Stat label="מהן הושלמו" value={d.content.completedRows} />
              <Stat label="מהן מתוכננות" value={d.content.plannedRows} />
              <Stat label="ציונים שהוזנו" value={d.content.gradedRows} />
              <Stat label="סמסטרי מילואים" value={d.content.miluimRows} />
              <Stat label="משימות לימוד" value={d.content.studyTasks} />
              <Stat label="שיחות עם היועץ" value={d.content.chatSessions} />
              <Stat label="סילבוסים שנסרקו" value={d.content.syllabi} />
            </div>
            <div>
              <Stat label="דירוגי קורסים" value={d.content.reviews} />
              <Stat label="תובנות מחזור" value={d.content.insights} />
              <Stat label="מסלולים ששותפו" value={d.content.sharedPlans} />
              <Stat label="נקודות ציון אנונימיות" value={d.content.gradePoints} />
              <Stat label="קשרי חונכות" value={d.content.mentorLinks} />
              <Stat label="הערות סינתזה" value={d.content.notes} />
              <Stat label="חומרי לימוד" value={d.content.materials} />
              <Stat label="אירועי יומן" value={d.content.calendarEvents} />
            </div>
          </div>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── מי הם ── */}
        <Section icon={GraduationCap} title="שנת פתיחת התואר" className="animate-stagger-4">
          <div>
            {[...d.cohort.byStartYear]
              .sort((a, b) => (b.key ?? 0) - (a.key ?? 0))
              .map((r) => (
                <Stat
                  key={String(r.key)}
                  label={r.key == null ? "עוד לא הצהירו" : hebrewYearLabel(r.key)}
                  value={r.n}
                />
              ))}
          </div>
        </Section>

        <Section icon={Sparkles} title="תחום מיקוד" className="animate-stagger-4">
          <div>
            {[...d.cohort.byFocus]
              .sort((a, b) => b.n - a.n)
              .map((r) => <Stat key={String(r.key)} label={focusLabel(r.key)} value={r.n} />)}
          </div>
        </Section>

        <Section icon={Shield} title="קבוצת מילואים" className="animate-stagger-4">
          <div>
            {[...d.cohort.byMiluim]
              .sort((a, b) => b.n - a.n)
              .map((r) => <Stat key={r.key} label={miluimLabel(r.key)} value={r.n} />)}
          </div>
        </Section>
      </div>

      {/* ── הקורסים המבוקשים ── */}
      <Section
        icon={BookOpen}
        title="הקורסים שהכי הרבה תכננו"
        subtitle="שורות בסטטוס מתוכנן או בלימוד. בשבוע הבידינג זה הנתון שאומר לאן הביקוש הולך."
        className="animate-stagger-4"
      >
        {d.topPlanned.length === 0 ? (
          <p className="py-2 text-sm text-foreground/60">עוד אף אחד לא תכנן קורס.</p>
        ) : (
          <div className="space-y-1.5">
            {d.topPlanned.map((c) => {
              const top = d.topPlanned[0]!.count;
              return (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-end font-mono text-xs font-semibold tabular-nums text-foreground/80" dir="ltr">
                    {n(c.count)}
                  </span>
                  <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-foreground/5">
                    <div
                      className="flex h-full items-center rounded bg-accent-brand/15 px-2"
                      style={{ width: `${Math.max(18, (c.count / top) * 100)}%` }}
                    >
                      <span className="truncate text-[11px] font-medium text-foreground/80">{c.nameHe}</span>
                    </div>
                  </div>
                  <span className="hidden w-24 shrink-0 font-mono text-[10px] text-foreground/50 sm:block" dir="ltr">
                    {c.code}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── בריאות ── */}
      <Section
        icon={ShieldAlert}
        title="בריאות המערכת"
        subtitle="הדברים שדורשים ממך פעולה, ומצב הקטלוג שכולם קוראים ממנו."
        className="animate-stagger-4"
      >
        {/* השורה שאומרת "האם המוצר עובד עכשיו" — מסד ומודל. */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
              health?.db
                ? "border-emerald-500/35 bg-emerald-500/8 text-status-green"
                : healthFailed || health
                  ? "border-red-500/35 bg-red-500/8 text-status-red"
                  : "border-border/60 text-foreground/60",
            )}
          >
            <Database className="size-3.5" />
            {health == null && !healthFailed ? "בודק מסד…" : health?.db ? "המסד עונה" : "המסד לא עונה"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
              health?.ai?.alive
                ? "border-emerald-500/35 bg-emerald-500/8 text-status-green"
                : health?.ai
                  ? "border-red-500/35 bg-red-500/8 text-status-red"
                  : "border-border/60 text-foreground/60",
            )}
          >
            <Sparkles className="size-3.5" />
            {health?.ai == null
              ? healthFailed
                ? "לא הצלחתי לבדוק את הספק"
                : "בודק את ספק ה-AI…"
              : health.ai.alive
                ? `המלך והסורקים עובדים${health.ai.lastStatus === 429 ? " · המכסה נגמרה לרגע" : ""}`
                : "ספק ה-AI לא עונה — המלך והסורקים מושבתים"}
          </span>
          {health?.ai?.respondingModel && (
            <span className="text-[10px] text-foreground/50">
              עונה: <bdi dir="ltr">{health.ai.respondingModel}</bdi>
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/60">קטלוג הקורסים</p>
            <p className="font-display text-xl font-bold tabular-nums text-foreground/85" dir="ltr">
              {n(d.catalog.active)}
            </p>
            <p className="text-[11px] leading-relaxed text-foreground/60">
              פעילים מתוך <bdi dir="ltr">{n(d.catalog.total)}</bdi> · <bdi dir="ltr">{n(d.catalog.withSchedule)}</bdi> עם שעות · <bdi dir="ltr">{n(d.catalog.sessions)}</bdi> מפגשים
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/60">מועדי בחינה</p>
            <p className="font-display text-xl font-bold tabular-nums text-foreground/85" dir="ltr">
              {n(d.catalog.withExamDates)}
            </p>
            <p className="text-[11px] leading-relaxed text-foreground/60">
              קורסים פעילים עם מועד א׳ מוגדר
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/60">תור מודרציה</p>
            <p
              className={cn(
                "font-display text-xl font-bold tabular-nums",
                d.health.pendingReviews + d.health.pendingInsights + d.health.reportedReviews > 0
                  ? "text-status-amber"
                  : "text-status-green",
              )}
              dir="ltr"
            >
              {n(d.health.pendingReviews + d.health.pendingInsights + d.health.reportedReviews)}
            </p>
            <p className="text-[11px] leading-relaxed text-foreground/60">
              <bdi dir="ltr">{n(d.health.pendingReviews)}</bdi> דירוגים · <bdi dir="ltr">{n(d.health.pendingInsights)}</bdi> תובנות · <bdi dir="ltr">{n(d.health.reportedReviews)}</bdi> דיווחים
            </p>
            {d.health.pendingReviews + d.health.pendingInsights + d.health.reportedReviews > 0 && (
              <Link
                href="/admin/moderation"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-brand underline-offset-2 hover:underline"
              >
                לטיפול במסך המודרציה
              </Link>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/60">סנכרון קטלוג אחרון</p>
            {d.health.lastSync ? (
              <>
                <p className="flex items-center gap-1.5 font-display text-sm font-bold">
                  {d.health.lastSync.status === "success" ? (
                    <CheckCircle2 className="size-4 text-status-green" />
                  ) : d.health.lastSync.status === "running" ? (
                    <RefreshCw className="size-4 animate-spin text-status-blue" />
                  ) : (
                    <AlertTriangle className="size-4 text-status-red" />
                  )}
                  <span className="text-foreground/85">
                    {d.health.lastSync.status === "success" ? "הצליח" : d.health.lastSync.status === "running" ? "רץ עכשיו" : "נכשל"}
                  </span>
                </p>
                <p className="text-[11px] leading-relaxed text-foreground/60">
                  {timeAgo(d.health.lastSync.startedAt)} · <bdi dir="ltr">{n(d.health.lastSync.changesFound)}</bdi> שינויים נמצאו, <bdi dir="ltr">{n(d.health.lastSync.changesApplied)}</bdi> הוחלו
                </p>
              </>
            ) : (
              <p className="text-[11px] leading-relaxed text-foreground/60">עוד לא רץ סנכרון.</p>
            )}
          </div>
        </div>
      </Section>

      {/* ── הנרשמים האחרונים ── */}
      <Section
        icon={CalendarClock}
        title={d.recentUsers.length === d.users.total ? "כל הנרשמים" : `${n(d.recentUsers.length)} הנרשמים האחרונים`}
        subtitle="מייל ושם — כדי שתוכל לענות למי שכותב לך. ציונים לא מוצגים כאן, בכוונה."
        className="animate-stagger-4"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-start text-xs">
            <caption className="sr-only">רשימת המשתמשים האחרונים שנרשמו, עם היקף הנתונים שהזינו</caption>
            <thead>
              <tr className="border-b border-border/40 text-[11px] text-foreground/60">
                <th scope="col" className="py-2 pe-3 text-start font-medium">נרשם</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">מייל</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">שם</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">שנה</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">מיקוד</th>
                <th scope="col" className="py-2 pe-3 text-end font-medium">קורסים</th>
                <th scope="col" className="py-2 pe-3 text-end font-medium">מילואים</th>
                <th scope="col" className="py-2 pe-3 text-end font-medium">משימות</th>
                <th scope="col" className="py-2 text-start font-medium">פעילות אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {d.recentUsers.map((u) => (
                <tr key={u.email} className="border-b border-border/25 last:border-0">
                  <td className="py-2 pe-3 whitespace-nowrap text-foreground/70">{dateHe(u.createdAt)}</td>
                  <td className="py-2 pe-3">
                    <span className="flex items-center gap-1.5">
                      <bdi dir="ltr" className="font-mono text-[11px] text-foreground/80">{u.email}</bdi>
                      {u.isAdmin && (
                        <span className="rounded bg-accent-brand/12 px-1.5 py-0.5 text-[9px] font-bold text-accent-brand">מנהל</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pe-3 text-foreground/75">{u.name ?? "—"}</td>
                  <td className="py-2 pe-3 whitespace-nowrap text-foreground/70">
                    {u.startYear == null ? "—" : hebrewYearLabel(u.startYear)}
                  </td>
                  <td className="py-2 pe-3 whitespace-nowrap text-foreground/70">{focusLabel(u.focusArea)}</td>
                  <td className="py-2 pe-3 text-end font-mono tabular-nums text-foreground/80" dir="ltr">{n(u.courses)}</td>
                  <td className="py-2 pe-3 text-end font-mono tabular-nums text-foreground/70" dir="ltr">{n(u.miluim)}</td>
                  <td className="py-2 pe-3 text-end font-mono tabular-nums text-foreground/70" dir="ltr">{n(u.tasks)}</td>
                  <td className="py-2 whitespace-nowrap text-foreground/60">{timeAgo(u.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── מה המסך הזה לא מראה, ולמה ── */}
      <div className="animate-stagger-4 flex items-start gap-2.5 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-3">
        <MessageSquare className="mt-0.5 size-4 shrink-0 text-foreground/50" />
        <p className="text-[11px] leading-relaxed text-foreground/60">
          המסך הזה סופר ולא קורא. הוא מראה <span className="font-medium text-foreground/75">כמה</span> ציונים,
          שיחות ותובנות נוצרו — לא <span className="font-medium text-foreground/75">מה</span> כתוב בהם. סטודנטים
          העלו את הגיליונות שלהם לכלי תכנון, ותוכן אישי לא נחשף כאן גם למי שמנהל את האפליקציה. דירוגי קורסים
          ותובנות מחזור שהוגשו לפרסום נבדקים במסך המודרציה, שם זה התפקיד.
        </p>
      </div>

      <p className="pb-2 text-center text-[10px] text-foreground/45">
        <Link2 className="me-1 inline size-3" />
        כל המספרים נספרו ישירות מהמסד ב־<bdi dir="ltr">{new Date(d.generatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</bdi>
      </p>
    </div>
  );
}
