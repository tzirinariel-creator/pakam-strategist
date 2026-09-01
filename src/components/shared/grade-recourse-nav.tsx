"use client";

import { Link } from "@/i18n/navigation";
import { api } from "@/lib/trpc/react";
import { binaryBenefitOf, type MiluimGroupKey } from "@/lib/miluim";
import { ArrowLeft, ArrowRight, RotateCcw, ToggleLeft, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";

// =========================================================================
// The line between the three grade tools (22-12)
// =========================================================================
// Ariel: "אין בהכרח קו מחבר בין להחליט על מועד ב׳, לבין המרת בינארי, לבין
// סימולציה."
//
// He is right, and it was literal: the three components carried no link to
// each other at all. They are three answers to ONE situation — a grade the
// student is not happy with — living on three routes, and the app never said
// so, so a student had to already know all three existed to reach the second.
//
// A signpost, not a wizard. Each row says WHEN that tool is the right one,
// because the three are not interchangeable and stacking them into a flow
// would imply they are:
//
//   · מועד ב׳ is a decision about a specific sitting, with a real date.
//   · Binary conversion spends a limited quota, and the secretariat's own
//     advice is to save it for the end of the degree — so it is deliberately
//     described as the one with a cost, not as a third button.
//   · The simulator decides nothing; it is the arithmetic you run before the
//     other two.
//
// The row for the screen you are on is not a link — it is the "you are here",
// which is what makes this a map rather than three more buttons.
//
// AND: binary conversion is a MILUIM benefit — groups B/C/G only, A and NONE
// never get it. Caught on the live page right after this component first
// shipped: mounted unconditionally on /record it offered every student a tool
// most of them do not have, which is inventing an entitlement. It is gated on
// the same predicate the advisor itself uses, resolved HERE from the profile
// rather than passed in by each of the three mounts — the version where one
// screen gets the gate right and another does not is the bug this whole
// component was written to fix.

type Tool = "moed-b" | "binary" | "simulator";

const TOOLS: {
  id: Tool;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  he: string;
  en: string;
  whenHe: string;
  whenEn: string;
}[] = [
  {
    id: "simulator",
    href: "/graduation",
    icon: Calculator,
    he: "סימולציית ציונים",
    en: "Grade simulator",
    whenHe: "לפני שמחליטים משהו — לראות כמה ציון אחד באמת מזיז את הממוצע.",
    whenEn: "Before deciding anything — see how much one grade actually moves your average.",
  },
  {
    id: "moed-b",
    href: "/exam-planner",
    icon: RotateCcw,
    he: "מועד ב׳",
    en: "Moed B",
    whenHe: "כשיש עוד מועד לקורס הזה, והשאלה היא אם שווה לגשת אליו.",
    whenEn: "When the course still has a sitting left, and the question is whether to take it.",
  },
  {
    id: "binary",
    href: "/record",
    icon: ToggleLeft,
    he: "המרה לבינארי",
    en: "Binary conversion",
    whenHe: "כשאין מה לתקן והציון פשוט לא ייכנס לממוצע — אבל המכסה מוגבלת, אז זו הדלת שסוגרים אחרונה.",
    whenEn: "When there is nothing left to fix and the grade simply leaves your average — but the quota is limited, so this is the last door you close.",
  },
];

/**
 * The other two ways of dealing with a disappointing grade.
 *
 * @param current the screen this is rendered on — that row becomes "you are
 *        here" rather than a link.
 */
export function GradeRecourseNav({
  current,
  isHe,
  className,
}: {
  current: Tool;
  isHe: boolean;
  className?: string;
}) {
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const profile = api.user.getProfile.useQuery();
  const hasBinary =
    binaryBenefitOf((profile.data?.miluimGroup ?? "NONE") as MiluimGroupKey) != null;

  // Say nothing until we know: a row that appears and then disappears is worse
  // than one that arrives a beat late.
  if (!profile.isSuccess) return null;
  // On /record with no binary benefit there is no "here" to be — and nothing
  // on that screen for this map to connect from.
  if (!hasBinary && current === "binary") return null;

  const tools = hasBinary ? TOOLS : TOOLS.filter((t) => t.id !== "binary");

  return (
    <div className={cn("rounded-xl border border-border/50 bg-foreground/[0.02] p-3", className)}>
      <p className="mb-2.5 text-xs font-medium text-foreground/70">
        {hasBinary
          ? isHe
            ? "שלוש דרכים לטפל בציון שלא מרוצים ממנו"
            : "Three ways to deal with a grade you're not happy with"
          : isHe
            ? "שתי דרכים לטפל בציון שלא מרוצים ממנו"
            : "Two ways to deal with a grade you're not happy with"}
      </p>
      <ul className="flex flex-col gap-1.5">
        {tools.map((tool) => {
          const here = tool.id === current;
          const Icon = tool.icon;
          const body = (
            <>
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                  here ? "bg-accent-brand/15 text-accent-brand" : "bg-foreground/[0.06] text-foreground/45",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span className={cn("text-sm font-medium", here ? "text-foreground/85" : "text-foreground/75")}>
                    {isHe ? tool.he : tool.en}
                  </span>
                  {here && (
                    <span className="rounded-full bg-accent-brand/10 px-1.5 py-px text-[10px] text-accent-brand">
                      {isHe ? "אתם כאן" : "you're here"}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground/50">
                  {isHe ? tool.whenHe : tool.whenEn}
                </span>
              </span>
            </>
          );

          return (
            <li key={tool.id}>
              {here ? (
                <div className="flex items-start gap-2.5 rounded-lg px-1 py-1">{body}</div>
              ) : (
                <Link
                  href={tool.href}
                  className="flex items-start gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-foreground/[0.04]"
                >
                  {body}
                  <Arrow className="mt-1.5 size-3.5 shrink-0 text-foreground/25" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
