"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  XCircle,
  Info,
  BarChart3,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { CourseDiff, FieldChange } from "@/lib/scraper/types";

/**
 * תרגום שגיאת-סנכרון לשפה שאפשר לפעול לפיה.
 *
 * המחרוזת הגולמית מגיעה מהשרת ונשארת על המסך — היא מה שמאפשר לאבחן.
 * אבל "Syllabus fetch failed: 401 UNAUTHORIZED" לא אומר לאף אחד מה קרה
 * ומה לעשות, ובמסך ניהול זה ההבדל בין תקלה שמטפלים בה לתקלה שמתרגלים
 * אליה. מוחזר null כשאין לנו הסבר — עדיף שקט מניחוש.
 */
function explainSyncError(raw: string): string | null {
  if (/\b401\b|UNAUTHORIZED/i.test(raw))
    return "מפתח הפרוקסי (ScrapingBee) נדחה. זו לא תקלה בידיעון — בדקו את SCRAPINGBEE_API_KEY במשתני הסביבה.";
  if (/\b403\b|FORBIDDEN/i.test(raw))
    return "הידיעון חסם את הבקשה. בדרך כלל חסימת IP — הפרוקסי אמור לעקוף אותה.";
  if (/\b429\b/.test(raw)) return "יותר מדי בקשות בזמן קצר. כדאי להמתין ולנסות שוב.";
  if (/timeout|timed out|AbortError/i.test(raw))
    return "הידיעון לא ענה בזמן. לרוב זמני.";
  if (/\b5\d\d\b/.test(raw)) return "שרת הידיעון החזיר שגיאה מצידו. לא משהו שאנחנו יכולים לתקן.";
  return null;
}

// =========================================
// Severity badge component
// =========================================

function SeverityBadge({ severity }: { severity: FieldChange["severity"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        severity === "safe"
          ? "bg-emerald-500/15 text-status-green"
          : "bg-amber-500/15 text-status-amber"
      )}
    >
      {severity === "safe" ? "אוטומטי" : "דורש אישור"}
    </span>
  );
}

// =========================================
// Status badge for sync logs
// =========================================

function StatusBadge({ status }: { status: string }) {
  const fallback = {
    bg: "bg-red-500/15",
    text: "text-status-red",
    icon: <XCircle className="h-3 w-3" />,
  };

  const config = {
    running: {
      bg: "bg-blue-500/15",
      text: "text-status-blue",
      icon: <RefreshCw className="h-3 w-3 animate-spin" />,
    },
    success: {
      bg: "bg-emerald-500/15",
      text: "text-status-green",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: fallback,
  } as Record<string, { bg: string; text: string; icon: React.ReactNode }>;

  const c = config[status] ?? fallback;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        c.bg,
        c.text
      )}
    >
      {c.icon}
      {status === "running" ? "רץ..." : status === "success" ? "הצליח" : "נכשל"}
    </span>
  );
}

// =========================================
// Field display name mapping
// =========================================

const FIELD_LABELS: Record<string, string> = {
  nameHe: "שם הקורס",
  lecturerName: "מרצה",
  lecturerEmail: "מייל מרצה",
  description: "תיאור",
  weeklyHours: "שעות שבועיות",
  credits: "ש״ס",
  examDateA: "מועד א׳",
  examDateB: "מועד ב׳",
  schedule: "מערכת שעות",
  room: "חדר",
  building: "בניין",
  semester: "סמסטר",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 60 ? value.slice(0, 60) + "…" : value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "object" ? `${v.day} ${v.time}` : String(v)
      )
      .join(", ");
  }
  return JSON.stringify(value);
}

// =========================================
// Main Dashboard Component
// =========================================

export function SyncDashboard() {
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(
    new Set()
  );
  const [showHistory, setShowHistory] = useState(false);

  // Queries
  const latestDiff = api.admin.getLatestDiff.useQuery();
  const syncLogs = api.admin.getSyncLogs.useQuery(
    { limit: 10 },
    { enabled: showHistory }
  );

  // Mutations
  const runSync = api.admin.runSync.useMutation({
    onSuccess: () => {
      latestDiff.refetch();
    },
  });

  const applyChanges = api.admin.applyChanges.useMutation({
    onSuccess: () => {
      setSelectedCourseIds(new Set());
      latestDiff.refetch();
      if (showHistory) syncLogs.refetch();
    },
    onError: (err) => {
      console.error("[applyChanges] Failed:", err.message);
    },
  });

  const runArazimSync = api.admin.runArazimSync.useMutation({
    onSuccess: () => {
      latestDiff.refetch();
      if (showHistory) syncLogs.refetch();
    },
  });

  // ── Extract diff from latest sync log ──
  const { diff, syncLogId } = useMemo(() => {
    if (!latestDiff.data?.diffJson) return { diff: null, syncLogId: null };
    try {
      const stored = latestDiff.data.diffJson as unknown as {
        diff?: CourseDiff;
        scrapeData?: Record<string, unknown>;
      };
      // Handle both formats: { diff, scrapeData } and raw CourseDiff
      const d = stored.diff ?? (stored as unknown as CourseDiff);
      return { diff: d, syncLogId: latestDiff.data.id };
    } catch {
      return { diff: null, syncLogId: null };
    }
  }, [latestDiff.data]);

  // ── Helpers ──

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const selectAll = () => {
    if (!diff) return;
    setSelectedCourseIds(new Set(diff.updated.map((u) => u.courseId)));
  };

  const handleApply = () => {
    if (!syncLogId || selectedCourseIds.size === 0) return;
    applyChanges.mutate({
      syncLogId,
      courseIds: Array.from(selectedCourseIds),
    });
  };

  // Check if last sync failed (likely TAU blocking)
  const lastSyncFailed = latestDiff.data?.status === "failed";
  const lastSyncHasErrors = diff?.errors && diff.errors.length > 0 &&
    diff.errors.some(e => e.error.includes("aborted") || e.error.includes("timeout") || e.error.includes("fetch failed"));

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground/90">
          סנכרון ידיעון
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          סנכרון קורסים מול אתר הידיעון של אוניברסיטת תל אביב
        </p>
      </div>

      {/* Status bar */}
      {latestDiff.data && (
        <div className="data-card flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <Clock className="h-4 w-4" />
            <span>סנכרון אחרון: </span>
            <span className="font-medium text-foreground/80">
              {latestDiff.data.completedAt
                ? new Date(latestDiff.data.completedAt).toLocaleString("he-IL")
                : "רץ..."}
            </span>
          </div>
          <StatusBadge status={latestDiff.data.status} />
          <span className="text-xs text-foreground/60">
            {latestDiff.data.coursesChecked} קורסים נבדקו •{" "}
            {latestDiff.data.changesFound} שינויים •{" "}
            {latestDiff.data.changesApplied} הוחלו
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => runSync.mutate({})}
          disabled={runSync.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all hover:scale-[1.02] hover:shadow-lg",
            runSync.isPending && "opacity-60 cursor-wait"
          )}
        >
          <RefreshCw
            className={cn("h-4 w-4", runSync.isPending && "animate-spin")}
          />
          {runSync.isPending ? "מסנכרן..." : "הרץ סנכרון"}
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/20"
        >
          {showHistory ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          היסטוריה
        </button>
      </div>

      {/* ── Arazim Grade Sync ── */}
      <div className="data-card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground/80">
              <BarChart3 className="h-4 w-4 text-status-purple" />
              סנכרון ציונים (Arazim)
            </h2>
            <p className="mt-0.5 text-xs text-foreground/60">
              עדכון נתוני קושי וציונים מ-Arazim Project. רץ אוטומטית כל יום ראשון.
            </p>
          </div>
          <button
            onClick={() => runArazimSync.mutate()}
            disabled={runArazimSync.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-status-purple transition-all hover:bg-violet-500/20",
              runArazimSync.isPending && "opacity-60 cursor-wait"
            )}
          >
            <BarChart3
              className={cn("h-4 w-4", runArazimSync.isPending && "animate-pulse")}
            />
            {runArazimSync.isPending ? "מעדכן ציונים..." : "עדכן ציונים"}
          </button>
        </div>

        {/* Arazim sync result */}
        {runArazimSync.isSuccess && runArazimSync.data && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-status-green">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {runArazimSync.data.coursesChecked} קורסים נבדקו •{" "}
              {runArazimSync.data.enriched} עם נתוני ציונים •{" "}
              {runArazimSync.data.updated} עודכנו •{" "}
              {runArazimSync.data.unchanged} ללא שינוי
            </span>
          </div>
        )}

        {/* Arazim sync error */}
        {runArazimSync.isError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-status-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">שגיאה בעדכון ציונים</p>
              <p className="mt-0.5 text-status-red/70">{runArazimSync.error.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* Sync error */}
      {(runSync.isError || lastSyncFailed || lastSyncHasErrors) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-status-amber">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {runSync.isError ? "הסנכרון נכשל" : "הסנכרון האחרון נתקל בבעיות"}
            </p>
            <p className="mt-1 text-status-amber/70">
              ייתכן שזו בעיית תקשורת זמנית מול שרתי הידיעון — אפשר לנסות שוב. אם כל
              הקורסים מחזירים 401, זה מפתח הפרוקסי ולא הידיעון.
            </p>
          </div>
        </div>
      )}

      {/* Summary stats from latest diff */}
      {diff && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "שינויים",
              value: diff.updated.length,
              color: diff.updated.length > 0 ? "text-status-amber" : "text-foreground/70",
            },
            {
              label: "ללא שינוי",
              value: diff.unchanged.length,
              color: "text-status-green",
            },
            {
              label: "לא נמצאו",
              value: diff.notFound.length,
              color: diff.notFound.length > 0 ? "text-status-amber" : "text-foreground/70",
            },
            {
              label: "שגיאות",
              value: diff.errors.length,
              color: diff.errors.length > 0 ? "text-status-red" : "text-foreground/70",
            },
          ].map((stat) => (
            <div key={stat.label} className="data-card p-3 text-center">
              <p className={cn("text-2xl font-bold", stat.color)}>
                {stat.value}
              </p>
              <p className="mt-0.5 text-xs text-foreground/60">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Diff viewer */}
      {diff && diff.updated.length > 0 && (
        <div className="space-y-3">
          {/* =================================================================
              האזהרה שנולדה מריצה אמיתית — 6.9
              =================================================================
              ברגע שהסנכרון חזר לעבוד (המפתח החתוך), הריצה הראשונה הציעה
              להחזיר את "פוליטיקה השוואתית" מסמסטר ב׳ לסמסטר א׳ ומיום
              שלישי ליום ראשון — כלומר **לבטל בדיוק את התיקון** שהוחל
              מייצוא הידיעון של תשפ״ז יום קודם, על קורס חובה, ימים לפני
              הבידינג.

              הסורק קורא את ims.tau.ac.il, והייצוא נלקח מעמוד הידיעון.
              השניים לא תמיד מדברים על אותה שנה. אין לי דרך להכריע בקוד
              מי צודק — אבל יש לי חובה לא להציג "החל הכל" ליד הצעה כזאת
              בלי לומר את זה. */}
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-xs leading-relaxed text-status-amber">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">קראו לפני שמחילים — במיוחד סמסטר ומערכת שעות</p>
              <p className="text-foreground/70">
                הסורק קורא מ-<span dir="ltr">ims.tau.ac.il</span>, וש״ס ושעות בקטלוג שלנו אומתו מול
                ייצוא הידיעון של תשפ״ז. השניים לא תמיד מדברים על אותה שנה — ובריצה מ-6.9 הסורק הציע
                להחזיר את פוליטיקה השוואתית מסמסטר ב׳ לסמסטר א׳, כלומר לבטל תיקון שנעשה מול הידיעון.
                שינוי שמסומן <b>דורש אישור</b> הוא בדיוק כזה: בדקו אותו מול הידיעון לפני שמחילים,
                ולא דרך &quot;בחר הכל&quot;.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground/80">
              שינויים שזוהו ({diff.updated.length})
            </h2>
            <div className="flex items-center gap-2">
              {/* היה 44×16 — מתחת לרף 24 פיקסל, על הפקד שמסמן שינויים
                  להחלה. מדוד ב-6.9. */}
              <button
                onClick={selectAll}
                className="inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground/90"
              >
                בחרו הכל
              </button>
              {selectedCourseIds.size > 0 && (
                <button
                  onClick={handleApply}
                  disabled={applyChanges.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-500",
                    applyChanges.isPending && "opacity-60 cursor-wait"
                  )}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  החל נבחרים ({selectedCourseIds.size})
                </button>
              )}
            </div>
          </div>

          {diff.updated.map((courseChange) => (
            <div
              key={courseChange.courseId}
              className={cn(
                "data-card overflow-hidden transition-all",
                selectedCourseIds.has(courseChange.courseId) &&
                  "ring-1 ring-emerald-500/30"
              )}
            >
              {/* Course header */}
              <div className="flex items-center gap-3 border-b border-border/50 p-3">
                <input
                  type="checkbox"
                  checked={selectedCourseIds.has(courseChange.courseId)}
                  onChange={() => toggleCourse(courseChange.courseId)}
                  className="h-4 w-4 rounded border-foreground/20 accent-emerald-500"
                />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-foreground/60">
                    {courseChange.courseCode}
                  </span>
                  <span className="mx-2 text-foreground/20">·</span>
                  <span className="text-sm font-medium text-foreground/80">
                    {courseChange.courseName}
                  </span>
                </div>
                <span className="text-xs text-foreground/60">
                  {courseChange.changes.length} שינויים
                </span>
              </div>

              {/* Changes table */}
              <div className="divide-y divide-border/30">
                {courseChange.changes.map((change, i) => (
                  <div
                    key={`${courseChange.courseId}-${change.field}-${i}`}
                    className="grid grid-cols-[120px_1fr_1fr_auto] items-center gap-2 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-foreground/60">
                      {FIELD_LABELS[change.field] ?? change.field}
                    </span>
                    <span className="truncate text-status-red/60 line-through">
                      {formatValue(change.oldValue)}
                    </span>
                    <span className="truncate text-status-green/80">
                      {formatValue(change.newValue)}
                    </span>
                    <SeverityBadge severity={change.severity} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================================
          "הכול מעודכן" — רק כשבאמת נבדק משהו
          =====================================================================
          6.9 — התנאי היה `updated.length === 0` בלבד, ולכן ריצה שבה כל
          שלושת הקורסים החזירו 401 הציגה וי ירוק ו"הכול מעודכן — אין
          שינויים", ומיד מתחתיו רשימת שלוש שגיאות. אישור ירוק על סמך
          בדיקה שלא קרתה הוא הדבר המסוכן במסך ניהול: הוא מרגיע במקום
          להתריע. עכשיו יש שלושה מצבים נפרדים, וכל אחד אומר את האמת שלו. */}
      {diff && diff.updated.length === 0 && diff.errors.length === 0 && diff.unchanged.length > 0 && (
        <div className="data-card flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-status-green/40" />
          <p className="text-foreground/60">הכול מעודכן — אין שינויים</p>
          <p className="text-xs text-foreground/60">
            {diff.unchanged.length} קורסים נבדקו ונמצאו זהים לידיעון
          </p>
        </div>
      )}

      {/* לא נבדק אף קורס בהצלחה — לא "מעודכן", פשוט לא ידוע */}
      {diff && diff.unchanged.length === 0 && diff.updated.length === 0 && diff.errors.length > 0 && (
        <div className="data-card flex flex-col items-center gap-2 py-10 text-center">
          <AlertCircle className="h-10 w-10 text-status-red/50" />
          <p className="font-medium text-foreground/75">אף קורס לא נבדק בהצלחה</p>
          <p className="max-w-md text-xs leading-relaxed text-foreground/60">
            כל {diff.errors.length} הניסיונות נכשלו, אז אין לנו מה להגיד על מצב הקטלוג מהריצה
            הזאת — לא שהוא מעודכן ולא שאינו. הפירוט למטה.
          </p>
        </div>
      )}

      {/* No data yet */}
      {!diff && !latestDiff.isLoading && (
        <div className="data-card flex flex-col items-center gap-2 py-12 text-center">
          <RefreshCw className="h-10 w-10 text-foreground/20" />
          <p className="text-foreground/60">טרם בוצע סנכרון</p>
          <p className="text-xs text-foreground/60">
            לחץ על &quot;הרץ סנכרון&quot; כדי לסנכרן קורסים מהידיעון
          </p>
        </div>
      )}

      {/* Errors */}
      {diff && diff.errors.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-status-red">
            שגיאות ({diff.errors.length})
          </h3>
          {diff.errors.map((err, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-red-500/10 bg-red-500/5 p-2 text-xs"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-status-red" />
              {/* השגיאה הגולמית נשארת — היא מה שמאפשר לאבחן. מעליה משפט
                  אחד בעברית שאומר מה זה אומר בפועל, כי "Syllabus fetch
                  failed: 401 UNAUTHORIZED" לא אומר לאיש מה לעשות. */}
              <div className="min-w-0">
                <span className="font-mono text-status-red/80">{err.code}</span>
                <span className="mx-1.5 text-foreground/20">—</span>
                <span className="text-foreground/60">{err.error}</span>
                {explainSyncError(err.error) && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/55">
                    {explainSyncError(err.error)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply success */}
      {applyChanges.isSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-status-green">
          <CheckCircle2 className="h-4 w-4" />
          <span>השינויים הוחלו בהצלחה!</span>
        </div>
      )}

      {/* Apply error */}
      {applyChanges.isError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-status-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">שגיאה בהחלת שינויים</p>
            <p className="mt-1 text-status-red/70">{applyChanges.error.message}</p>
          </div>
        </div>
      )}

      {/* Sync history */}
      {showHistory && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground/80">
            היסטוריית סנכרון
          </h2>

          {syncLogs.isLoading && (
            <p className="text-sm text-foreground/60">טוען...</p>
          )}

          {syncLogs.data?.map((log) => {
            const isArazim = (log.diffJson as Record<string, unknown> | null)?.source === "arazim";
            return (
              <div
                key={log.id}
                className="data-card flex flex-wrap items-center gap-3 p-3 text-sm"
              >
                <StatusBadge status={log.status} />
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  isArazim ? "bg-violet-500/15 text-status-purple" : "bg-blue-500/15 text-status-blue"
                )}>
                  {isArazim ? "ציונים" : "ידיעון"}
                </span>
                <span className="text-foreground/60">
                  {new Date(log.startedAt).toLocaleString("he-IL")}
                </span>
                <span className="text-xs text-foreground/60">
                  {log.coursesChecked} נבדקו • {log.changesFound} שינויים •{" "}
                  {log.changesApplied} הוחלו
                </span>
                {log.errorMessage && (
                  <span className="text-xs text-status-red/70">
                    {log.errorMessage.slice(0, 80)}
                  </span>
                )}
              </div>
            );
          })}

          {syncLogs.data?.length === 0 && (
            <p className="text-sm text-foreground/60">אין היסטוריה עדיין</p>
          )}
        </div>
      )}
    </div>
  );
}
