"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { UserPlus, Check, X, Eye, ShieldCheck, Mail, Loader2, ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { DISCIPLINE_CONFIG, SEMESTER_CONFIG, YEAR_CONFIG } from "@/lib/constants";
import { advisorError } from "@/lib/advisor-toast";
import { cn } from "@/lib/utils";

/**
 * Consent-based named mentoring (owner 23.7). One page, both roles:
 *   • invite a mentor + see who can view my plan (revoke anytime);
 *   • as a mentor, respond to invitations + view my mentees' PLANS (never grades).
 * Plain product-plural copy. The privacy contract is enforced server-side
 * (mentor.getMenteePlan requires an ACTIVE link and never selects grades).
 */
export function MentorsContent() {
  const isHe = useLocale() === "he";
  const utils = api.useUtils();

  const myMentors = api.mentor.myMentors.useQuery();
  const pending = api.mentor.pendingInvites.useQuery();
  const myMentees = api.mentor.myMentees.useQuery();

  const [email, setEmail] = useState("");
  const [viewing, setViewing] = useState<{ userId: string; name: string } | null>(null);

  const refetchAll = () => {
    void utils.mentor.myMentors.invalidate();
    void utils.mentor.pendingInvites.invalidate();
    void utils.mentor.myMentees.invalidate();
  };

  const invite = api.mentor.invite.useMutation({
    onSuccess: () => { setEmail(""); refetchAll(); },
    onError: (e) => advisorError(e.message),
  });
  const respond = api.mentor.respond.useMutation({ onSuccess: refetchAll, onError: (e) => advisorError(e.message) });
  const endLink = api.mentor.endLink.useMutation({ onSuccess: refetchAll, onError: (e) => advisorError(e.message) });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="bg-mesh space-y-6 p-4 md:p-6">
      {/* Mentoring is the NAMED half of השושלת (#41) — the cohort file is the
          anonymous half. Saying so here is what stops the split from reading
          as arbitrary, and gives the page a way back to the concept. */}
      <header className="animate-stagger-1 space-y-2">
        <Link
          href="/lineage"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/60 transition-colors hover:text-foreground/75"
        >
          {isHe ? "השושלת" : "The Lineage"}
          <ChevronLeft className="size-3.5 ltr:rotate-180" />
        </Link>
        <h1 className="font-display text-3xl font-bold text-foreground/85">
          {isHe ? "חונכות" : "Mentoring"}
        </h1>
        <p className="max-w-2xl text-foreground/60">
          {isHe
            ? "הזמינו סטודנטים שאתם סומכים עליהם לראות את תוכנית-התואר שלכם ולייעץ. הם רואים את הקורסים והסמסטרים בלבד — לעולם לא את הציונים. אתם שולטים: אפשר לנתק בכל רגע."
            : "Invite someone you trust to view your degree plan and advise. They see your courses and semesters only — never your grades. You're in control: end it anytime."}
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-foreground/60">
          {isHe
            ? "זה הצד עם השמות. הצד האנונימי — ממוצעים, דירוגים וטיפים בלי לדעת מי כתב — נמצא בתיק המחזור, ושם אף אחד לא מזמין אף אחד."
            : "This is the named side. The anonymous side — averages, ratings and tips with no idea who wrote them — lives in the cohort file, where nobody invites anybody."}
        </p>
      </header>

      {/* ── Invite + who can see my plan (I am the MENTEE) ── */}
      <section className="data-card animate-stagger-2 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-status-green" />
          <h2 className="font-display text-lg font-bold text-foreground/85">
            {isHe ? "מי רואה את התוכנית שלי" : "Who can see my plan"}
          </h2>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-foreground/60 start-3" />
            <input
              type="email"
              inputMode="email"
              dir="auto"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isHe ? "אימייל של המנטור (רשומים לפכמון)" : "Mentor's email (a Pakamon user)"}
              className="w-full rounded-lg border border-border bg-card/60 py-2.5 pe-3 ps-9 text-sm text-foreground placeholder:text-foreground/60 focus:border-accent-brand focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={!emailValid || invite.isPending}
            onClick={() => invite.mutate({ mentorEmail: email.trim() })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-brand px-4 py-2.5 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover disabled:opacity-50"
          >
            {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {isHe ? "הזמנה" : "Invite"}
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {(myMentors.data ?? []).length === 0 && !myMentors.isLoading && (
            <li className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-foreground/60">
              {isHe ? "עדיין לא הזמנתם אף אחד. התוכנית שלכם פרטית לגמרי." : "You haven't invited anyone. Your plan is fully private."}
            </li>
          )}
          {(myMentors.data ?? []).map((m) => (
            <li key={m.linkId} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground/85">{m.mentorName}</p>
                <p className="text-xs text-foreground/60">
                  {m.status === "ACTIVE"
                    ? (isHe ? "רואה את התוכנית שלכם" : "Can see your plan")
                    : (isHe ? "ממתינים לאישור ההזמנה" : "Invitation pending")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => endLink.mutate({ linkId: m.linkId })}
                disabled={endLink.isPending}
                className="shrink-0 rounded-lg bg-foreground/8 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-red-500/15 hover:text-status-red disabled:opacity-50"
              >
                {m.status === "ACTIVE" ? (isHe ? "ניתוק" : "Revoke") : (isHe ? "ביטול" : "Cancel")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Invitations addressed to me (I am the invited MENTOR) ── */}
      {(pending.data ?? []).length > 0 && (
        <section className="data-card animate-stagger-3 p-5">
          <h2 className="font-display text-lg font-bold text-foreground/85">
            {isHe ? "הזמנות שממתינות לכם" : "Invitations for you"}
          </h2>
          <ul className="mt-4 space-y-2">
            {(pending.data ?? []).map((inv) => (
              <li key={inv.linkId} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
                <p className="min-w-0 truncate text-sm text-foreground/85">
                  <span className="font-medium">{inv.menteeName}</span>{" "}
                  <span className="text-foreground/60">{isHe ? "מזמינים אתכם לראות את התוכנית ולייעץ" : "invited you to view their plan and advise"}</span>
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => respond.mutate({ linkId: inv.linkId, accept: true })}
                    disabled={respond.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-status-green transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <Check className="size-3.5" /> {isHe ? "אישור" : "Accept"}
                  </button>
                  <button
                    type="button"
                    onClick={() => respond.mutate({ linkId: inv.linkId, accept: false })}
                    disabled={respond.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-foreground/8 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/15 disabled:opacity-50"
                  >
                    <X className="size-3.5" /> {isHe ? "דחייה" : "Decline"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Students I mentor (I am the MENTOR) ── */}
      {(myMentees.data ?? []).length > 0 && (
        <section className="data-card animate-stagger-4 p-5">
          <h2 className="font-display text-lg font-bold text-foreground/85">
            {isHe ? "אני מנטור" : "I mentor"}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {(myMentees.data ?? []).map((m) => (
              <li key={m.linkId}>
                <button
                  type="button"
                  onClick={() => setViewing({ userId: m.menteeUserId, name: m.menteeName })}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-accent-brand/50 hover:text-foreground"
                >
                  <Eye className="size-4 text-accent-brand" />
                  {m.menteeName}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {viewing && (
        <MenteePlan
          menteeUserId={viewing.userId}
          menteeName={viewing.name}
          isHe={isHe}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A mentee's plan, read-only, PLAN-ONLY (the server never sends grades).
// ---------------------------------------------------------------------------
function MenteePlan({ menteeUserId, menteeName, isHe, onClose }: {
  menteeUserId: string;
  menteeName: string;
  isHe: boolean;
  onClose: () => void;
}) {
  const q = api.mentor.getMenteePlan.useQuery({ menteeUserId });

  const grouped = useMemo(() => {
    const g = new Map<string, { year: number; semester: string; courses: NonNullable<typeof q.data>["courses"] }>();
    for (const c of q.data?.courses ?? []) {
      const key = `${c.plannedYear}-${c.plannedSemester}`;
      if (!g.has(key)) g.set(key, { year: c.plannedYear, semester: c.plannedSemester, courses: [] });
      g.get(key)!.courses.push(c);
    }
    return [...g.values()].sort((a, b) => a.year - b.year || a.semester.localeCompare(b.semester));
  }, [q.data]);

  const statusLabel = (s: string) =>
    isHe
      ? ({ COMPLETED: "הושלם", IN_PROGRESS: "בלימוד", PLANNED: "מתוכנן", FAILED: "נכשל", EXEMPT: "פטור" } as Record<string, string>)[s] ?? s
      : s;

  return (
    <section className="data-card animate-stagger-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-accent-brand" />
          <h2 className="font-display text-lg font-bold text-foreground/85">
            {isHe ? `התוכנית של ${menteeName}` : `${menteeName}'s plan`}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
          aria-label={isHe ? "סגירה" : "Close"}
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-foreground/60">
        {isHe ? "קורסים וסמסטרים בלבד — הציונים נשארים פרטיים." : "Courses and semesters only — grades stay private."}
      </p>

      {q.isLoading && <p className="mt-4 text-sm text-foreground/60">{isHe ? "טוען…" : "Loading…"}</p>}
      {q.isError && (
        <p className="mt-4 text-sm text-status-red/80">
          {isHe ? "לא הצלחנו לטעון — ייתכן שהגישה נותקה." : "Couldn't load — access may have been revoked."}
        </p>
      )}

      {!q.isLoading && !q.isError && grouped.length === 0 && (
        <p className="mt-4 text-sm text-foreground/60">{isHe ? "אין עדיין קורסים בתוכנית." : "No courses in the plan yet."}</p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {grouped.map((g) => {
          const yearCfg = YEAR_CONFIG[g.year as keyof typeof YEAR_CONFIG];
          const semCfg = SEMESTER_CONFIG[g.semester as keyof typeof SEMESTER_CONFIG];
          const yearLabel = isHe ? (yearCfg?.nameHe ?? `שנה ${g.year}`) : (yearCfg?.nameEn ?? `Year ${g.year}`);
          const semLabel = isHe ? (semCfg?.short ?? g.semester) : (semCfg?.shortEn ?? g.semester);
          return (
            <div key={`${g.year}-${g.semester}`} className="rounded-xl border border-border/60 bg-card/40 p-3">
              <p className="mb-2 text-xs font-semibold text-foreground/60">{yearLabel} · {semLabel}</p>
              <ul className="space-y-1.5">
                {g.courses.map((c) => {
                  const disc = (c.disciplineOverride ?? c.course.discipline) as keyof typeof DISCIPLINE_CONFIG;
                  const dc = DISCIPLINE_CONFIG[disc];
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dc?.color ?? "gray" }} />
                        <span className="truncate text-foreground/80">{isHe ? c.course.nameHe : (c.course.nameEn ?? c.course.nameHe)}</span>
                      </span>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        c.status === "COMPLETED" ? "bg-emerald-500/15 text-status-green"
                          : c.status === "IN_PROGRESS" ? "bg-accent-brand/15 text-accent-brand"
                          : c.status === "FAILED" ? "bg-red-500/15 text-status-red"
                          : "bg-foreground/8 text-foreground/70",
                      )}>
                        {statusLabel(c.status)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
