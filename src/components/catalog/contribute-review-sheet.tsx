"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ALLOWED_TAGS, TAG_LABELS, type CourseTag } from "@/lib/course-knowledge-tags";
import { api } from "@/lib/trpc/react";
import { Bidi } from "@/lib/bidi";
import { cn } from "@/lib/utils";

const TIP_MAX = 400;

type Verdict = "RECOMMEND" | "NEUTRAL" | "AVOID";

// Ariel, 22-18: "למה שישאלו אם הייתי מוותר על קורס חובה?"
//
// He is right, and it was worse than merely odd. "הייתי מדלג" on מיקרו א׳ is
// an answer nobody can act on — and it does not stop at the person answering:
// it is stored as AVOID and reaches the next student as advice to skip a
// course they are required to take.
//
// The stored value keeps ONE meaning across every course — study VALUE, and
// the aggregate would be meaningless if AVOID meant "skip it" on an elective
// and something else on a requirement. So the enum is untouched and only the
// WORDING changes: on a required course the same judgement is offered as
// "לא נתן לי הרבה", which is what a person can honestly say about a course
// they had no choice about.
const VERDICTS: { value: Verdict; he: string; heRequired?: string; en: string; enRequired?: string; cls: string }[] = [
  { value: "RECOMMEND", he: "שווה", en: "Worth it", cls: "data-[on=true]:border-emerald-500/60 data-[on=true]:bg-emerald-500/15 data-[on=true]:text-emerald-600 dark:data-[on=true]:text-emerald-400" },
  { value: "NEUTRAL", he: "ניטרלי", en: "Neutral", cls: "data-[on=true]:border-foreground/40 data-[on=true]:bg-foreground/10 data-[on=true]:text-foreground/80" },
  { value: "AVOID", he: "הייתי מדלג", heRequired: "לא נתן לי הרבה", en: "Would skip", enRequired: "Gave me little", cls: "data-[on=true]:border-red-500/60 data-[on=true]:bg-red-500/15 data-[on=true]:text-red-600 dark:data-[on=true]:text-red-400" },
];

/**
 * Contribute a rating + review for a course (#3/#16). Step-buttons (not native
 * sliders — accessible on touch, ≥44px) for workload/difficulty 1–5, three
 * verdict buttons, a ≤400-char tip with a live counter, and closed-vocabulary
 * tag chips. Honesty-first: verdict is study VALUE ("worth it / skip"), never
 * "easy points". At least one field is required (server enforces too).
 */
export function ContributeReviewSheet({
  courseCode,
  courseName,
  open,
  onClose,
}: {
  courseCode: string;
  courseName: string;
  open: boolean;
  onClose: () => void;
}) {
  const isHe = useLocale() === "he";
  const utils = api.useUtils();

  // Resolved here rather than passed in: the sheet opens from four places and
  // only the catalog modal holds the course record. A prop would have fixed
  // the wording on one of the four doors.
  const facts = api.courseKnowledge.courseFacts.useQuery(
    { code: courseCode },
    { enabled: open, staleTime: 60 * 60 * 1000 },
  );
  const isRequired = facts.data?.isMandatory ?? false;

  const [workload, setWorkload] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tip, setTip] = useState("");
  const [tags, setTags] = useState<CourseTag[]>([]);

  const contribute = api.courseKnowledge.contributeReview.useMutation({
    onSuccess: () => {
      void utils.courseKnowledge.getForCourse.invalidate({ courseCode });
      // Ariel, 1.9: "תרמתי עוד וזה לא מעלה אותי בדרגה."
      //
      // The rank counts reviews, insights and published plans together
      // (cohort.myContributionStats), and only ONE of the three refreshed it.
      // A review lives in the courseKnowledge router, a published plan
      // invalidated only the gallery — so both left the tally showing the
      // number from before the contribution, until a hard reload.
      // A counter that does not move when you feed it is worse than no counter.
      void utils.cohort.myContributionStats.invalidate();
      toast.success(isHe ? "תודה — עזרתם למחזור הבא." : "Thanks — you helped the next cohort.");
      reset();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || (isHe ? "משהו השתבש. נסו שוב." : "Something went wrong. Try again."));
      // "Only someone who completed the course can rate it" is terminal for this
      // user — close the sheet instead of leaving it open with their input as a
      // dead-end (#audit-r3). The server is the source of truth for eligibility.
      if (err.data?.code === "FORBIDDEN") {
        onClose();
      }
    },
  });

  function reset() {
    setWorkload(null);
    setDifficulty(null);
    setVerdict(null);
    setTip("");
    setTags([]);
  }

  const hasAny = workload != null || difficulty != null || verdict != null || tip.trim().length > 0;

  function toggleTag(tag: CourseTag) {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 6) return prev; // server cap
      return [...prev, tag];
    });
  }

  function submit() {
    if (!hasAny || contribute.isPending) return;
    contribute.mutate({
      courseCode,
      workload: workload ?? undefined,
      difficulty: difficulty ?? undefined,
      verdict: verdict ?? undefined,
      tip: tip.trim() || undefined,
      tags,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start text-base font-bold">
            {isHe ? "דרגו את הקורס" : "Rate this course"}
          </DialogTitle>
          <DialogDescription className="text-start text-xs text-foreground/60">
            {courseName} · {isHe ? "אנונימי לחלוטין. עוזר למחזור הבא לבחור נכון." : "Fully anonymous. Helps the next cohort choose well."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-1">
          <ScaleRow
            label={isHe ? "עומס שבועי" : "Weekly workload"}
            lowHe="קליל" lowEn="Light" highHe="כבד" highEn="Heavy"
            isHe={isHe}
            value={workload}
            onChange={setWorkload}
          />
          <ScaleRow
            label={isHe ? "קושי החומר" : "Material difficulty"}
            lowHe="קל" lowEn="Easy" highHe="קשה" highEn="Hard"
            isHe={isHe}
            value={difficulty}
            onChange={setDifficulty}
          />

          {/* Verdict */}
          <div>
            <div className="mb-2 text-xs font-medium text-foreground/70">
              {isHe ? "היה שווה?" : "Was it worth it?"}
            </div>
            {isRequired && (
              <p className="mb-2 text-[11px] leading-snug text-foreground/60">
                {isHe
                  ? "קורס חובה — אף אחד לא באמת יכול לדלג עליו. מה שכן עוזר למי שאחריכם זה לדעת למה לצפות."
                  : "A required course — nobody can actually skip it. What helps the next cohort is knowing what to expect."}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {VERDICTS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  data-on={verdict === v.value}
                  onClick={() => setVerdict((prev) => (prev === v.value ? null : v.value))}
                  className={cn(
                    "min-h-[44px] rounded-lg border border-border/60 bg-foreground/[0.02] px-2 py-2 text-xs font-medium text-foreground/70 transition-colors",
                    v.cls
                  )}
                >
                  {isHe
                    ? (isRequired && v.heRequired) || v.he
                    : (isRequired && v.enRequired) || v.en}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="mb-2 text-xs font-medium text-foreground/70">
              {isHe ? "תגיות (עד 6)" : "Tags (up to 6)"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALLOWED_TAGS.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on
                        ? "border-accent-brand/50 bg-accent-brand/15 text-accent-brand"
                        : "border-border/60 bg-foreground/[0.02] text-foreground/60 hover:border-accent-brand/30"
                    )}
                  >
                    {isHe ? TAG_LABELS[tag].he : TAG_LABELS[tag].en}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tip */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">{isHe ? "טיפ למחזור הבא" : "A tip for the next cohort"}</span>
              <span className="text-[10px] tabular-nums text-foreground/60" dir="ltr">
                <Bidi text={`${tip.length}/${TIP_MAX}`} />
              </span>
            </div>
            <textarea
              value={tip}
              onChange={(e) => setTip(e.target.value.slice(0, TIP_MAX))}
              maxLength={TIP_MAX}
              rows={3}
              placeholder={isHe ? "מה כדאי לדעת מראש? (בלי שמות מרצים בהשמצה, בלי קישורים)" : "What's worth knowing in advance?"}
              className="w-full resize-none rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5 text-xs leading-relaxed text-foreground/85 outline-none placeholder:text-foreground/60 focus:border-accent-brand/40"
            />
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!hasAny || contribute.isPending}
            className="min-h-[44px] rounded-lg bg-accent-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {contribute.isPending ? (isHe ? "שולח…" : "Sending…") : isHe ? "שתפו" : "Share"}
          </button>
          {!hasAny && (
            <p className="-mt-3 text-center text-[11px] text-foreground/60">
              {isHe ? "מלאו לפחות שדה אחד." : "Fill at least one field."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScaleRow({
  label,
  lowHe, lowEn, highHe, highEn,
  isHe,
  value,
  onChange,
}: {
  label: string;
  lowHe: string; lowEn: string; highHe: string; highEn: string;
  isHe: boolean;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-foreground/70">{label}</div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "flex min-h-[44px] flex-1 items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-colors",
              value != null && n <= value
                ? "border-accent-brand/50 bg-accent-brand/15 text-accent-brand"
                : "border-border/60 bg-foreground/[0.02] text-foreground/60 hover:border-accent-brand/30"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-foreground/60">
        <span>{isHe ? lowHe : lowEn}</span>
        <span>{isHe ? highHe : highEn}</span>
      </div>
    </div>
  );
}
