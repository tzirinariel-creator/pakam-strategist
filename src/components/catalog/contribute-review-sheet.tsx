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

const VERDICTS: { value: Verdict; he: string; en: string; cls: string }[] = [
  { value: "RECOMMEND", he: "שווה", en: "Worth it", cls: "data-[on=true]:border-emerald-500/60 data-[on=true]:bg-emerald-500/15 data-[on=true]:text-emerald-600 dark:data-[on=true]:text-emerald-400" },
  { value: "NEUTRAL", he: "ניטרלי", en: "Neutral", cls: "data-[on=true]:border-foreground/40 data-[on=true]:bg-foreground/10 data-[on=true]:text-foreground/80" },
  { value: "AVOID", he: "הייתי מדלג", en: "Would skip", cls: "data-[on=true]:border-red-500/60 data-[on=true]:bg-red-500/15 data-[on=true]:text-red-600 dark:data-[on=true]:text-red-400" },
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

  const [workload, setWorkload] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tip, setTip] = useState("");
  const [tags, setTags] = useState<CourseTag[]>([]);

  const contribute = api.courseKnowledge.contributeReview.useMutation({
    onSuccess: () => {
      void utils.courseKnowledge.getForCourse.invalidate({ courseCode });
      toast.success(isHe ? "תודה — עזרתם למחזור הבא." : "Thanks — you helped the next cohort.");
      reset();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || (isHe ? "משהו השתבש. נסו שוב." : "Something went wrong. Try again."));
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
          <DialogDescription className="text-start text-xs text-foreground/55">
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
                  {isHe ? v.he : v.en}
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
              <span className="text-[10px] tabular-nums text-foreground/40" dir="ltr">
                <Bidi text={`${tip.length}/${TIP_MAX}`} />
              </span>
            </div>
            <textarea
              value={tip}
              onChange={(e) => setTip(e.target.value.slice(0, TIP_MAX))}
              maxLength={TIP_MAX}
              rows={3}
              placeholder={isHe ? "מה כדאי לדעת מראש? (בלי שמות מרצים בהשמצה, בלי קישורים)" : "What's worth knowing in advance?"}
              className="w-full resize-none rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5 text-xs leading-relaxed text-foreground/85 outline-none placeholder:text-foreground/35 focus:border-accent-brand/40"
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
            <p className="-mt-3 text-center text-[11px] text-foreground/40">
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
                : "border-border/60 bg-foreground/[0.02] text-foreground/45 hover:border-accent-brand/30"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
        <span>{isHe ? lowHe : lowEn}</span>
        <span>{isHe ? highHe : highEn}</span>
      </div>
    </div>
  );
}
