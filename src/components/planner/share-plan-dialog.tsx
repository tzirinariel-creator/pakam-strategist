"use client";

import { useLocale } from "next-intl";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { encodePlan, type SharedCourse } from "@/lib/plan-share";

/**
 * Share dialog (#3/#16) — replaces the old silent copy-to-clipboard. Shows the
 * student exactly WHAT a friend will see (courses, semesters, credit total)
 * and what they never will (grades, personal details), then offers copy-link
 * or WhatsApp. No name, no gold, no King — sharing is the student's voice,
 * indigo only.
 */
export function SharePlanDialog({
  open,
  onOpenChange,
  courses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: SharedCourse[];
}) {
  const isHe = useLocale() === "he";

  const shareUrl = () =>
    `${window.location.origin}/${isHe ? "he" : "en"}/shared-plan?d=${encodePlan(courses)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast.success(isHe ? "הקישור הועתק — שלחו לחבר" : "Link copied — send it to a friend");
      onOpenChange(false);
    } catch {
      toast.error(isHe ? "ההעתקה נכשלה" : "Copy failed");
    }
  };

  const shareWhatsApp = () => {
    const text =
      (isHe
        ? "בניתי את תוכנית התואר שלי בפכמון. אפשר לראות ולהעתיק כאן: "
        : "I built my degree plan in Pakamon. View and copy it here: ") + shareUrl();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isHe ? "שיתוף התוכנית" : "Share your plan"}</DialogTitle>
          <DialogDescription className="text-sm text-foreground/55">
            {isHe
              ? "מי שמקבל את הקישור רואה: הקורסים, השנים והסמסטרים, וסך הש״ס."
              : "Whoever gets the link sees: the courses, years and semesters, and the credit total."}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-foreground/50">
          {isHe ? "בלי ציונים, בלי פרטים אישיים." : "No grades, no personal details."}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-brand px-4 py-2.5 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
          >
            <Copy className="size-4" />
            {isHe ? "העתקת קישור" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={shareWhatsApp}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/40 px-4 py-2.5 text-sm font-medium text-foreground/75 transition-colors hover:border-foreground/25 hover:text-foreground/90"
          >
            <MessageCircle className="size-4" />
            {isHe ? "שליחה בוואטסאפ" : "Send on WhatsApp"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
