"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { X, BookOpen, GraduationCap, Award, Flag, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bidi } from "@/lib/bidi";

// ─── Semester intro data ────────────────────────────────────────────

interface SemesterIntroData {
  titleHe: string;
  titleEn: string;
  descHe: string;
  descEn: string;
  icon: typeof BookOpen;
  color: string;
  creditRangeHe?: string;
  creditRangeEn?: string;
}

const SEMESTER_INTROS: Record<string, SemesterIntroData> = {
  "1-FALL": {
    titleHe: "שנה א׳ סמסטר א׳ — הבסיס",
    titleEn: "Year 1 Fall — The Foundation",
    descHe:
      "קורסי ליבה בפילוסופיה, כלכלה ומדע המדינה. קריאה מודרכת א׳ וחשיבה אקדמית. סמסטר של בניית בסיס חזק.",
    descEn:
      "Core courses in Philosophy, Economics, and Political Science. Guided Reading I and academic thinking.",
    icon: BookOpen,
    color: "bg-blue-500/10 border-blue-500/20 text-blue-600",
    creditRangeHe: "מומלץ: 23-25 ש״ס",
    creditRangeEn: "Recommended: 23-25 credits",
  },
  "1-SPRING": {
    titleHe: "שנה א׳ סמסטר ב׳ — המשך בסיס",
    titleEn: "Year 1 Spring — Building On",
    descHe:
      "המשך קורסי בסיס + קורס משפט ראשון + קורסי בחירה ראשונים. ההזדמנות הראשונה להתאים את התואר למיקוד שלכם.",
    descEn:
      "Continuing foundations + first law course + first electives. Your first chance to shape the degree toward your focus area.",
    icon: BookOpen,
    color: "bg-blue-500/10 border-blue-500/20 text-blue-600",
    creditRangeHe: "מומלץ: 27-29 ש״ס",
    creditRangeEn: "Recommended: 27-29 credits",
  },
  "2-FALL": {
    titleHe: "שנה ב׳ סמסטר א׳ — תחום מיקוד",
    titleEn: "Year 2 Fall — Specialization Begins",
    descHe:
      "סמינר ראשון (בפילוסופיה או מד״מ), קורסי בחירה מתקדמים, והקורס האינטגרטיבי שמחבר בין כל התחומים.",
    descEn:
      "First seminar (Philosophy or PoliSci), advanced electives, and the integrative course connecting all disciplines.",
    icon: GraduationCap,
    color: "bg-amber-500/10 border-amber-500/20 text-amber-600",
    creditRangeHe: "מומלץ: 15-30 ש״ס",
    creditRangeEn: "Recommended: 15-30 credits",
  },
  "2-SPRING": {
    titleHe: "שנה ב׳ סמסטר ב׳ — עומק",
    titleEn: "Year 2 Spring — Going Deeper",
    descHe:
      "סמינר שני, קורסי משפט, ובחירות בתחום המיקוד. חשוב לוודא שאתם עומדים בממוצע 75 כללי + 80 בפכ״מ.",
    descEn:
      "Second seminar, law courses, and focus area electives. Make sure you meet the 75 overall + 80 PPE GPA threshold.",
    icon: GraduationCap,
    color: "bg-amber-500/10 border-amber-500/20 text-amber-600",
    creditRangeHe: "מומלץ: 16-30 ש״ס",
    creditRangeEn: "Recommended: 16-30 credits",
  },
  "3-FALL": {
    titleHe: "שנה ג׳ סמסטר א׳ — סיום",
    titleEn: "Year 3 Fall — The Final Stretch",
    descHe:
      "סמינרים אחרונים (כולל כלכלה — רק בשנה ג׳!), בחירות מתקדמות, השלמת דרישות משפט. סמינרי כלכלה: מקסימום 2.",
    descEn:
      "Final seminars (including Economics — only in Year 3!), advanced electives, completing law requirements. Max 2 Econ seminars.",
    icon: Award,
    color: "bg-foreground/5 border-foreground/15 text-foreground/70",
    creditRangeHe: "מומלץ: 12-25 ש״ס",
    creditRangeEn: "Recommended: 12-25 credits",
  },
  "3-SPRING": {
    titleHe: "שנה ג׳ סמסטר ב׳ — קו הסיום",
    titleEn: "Year 3 Spring — Finish Line",
    descHe:
      "סמסטר אחרון. השלמת קורסים, סמינר אחרון אם צריך, ווידוא 150 ש״ס + כל הדרישות.",
    descEn:
      "Final semester. Complete remaining courses, last seminar if needed, and verify you've hit 150 credits + all requirements.",
    icon: Flag,
    color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
    creditRangeHe: "מומלץ: 10-20 ש״ס",
    creditRangeEn: "Recommended: 10-20 credits",
  },
};

// ─── Component ──────────────────────────────────────────────────────

interface SemesterIntroCardProps {
  year: number;
  semester: "FALL" | "SPRING";
}

export function SemesterIntroCard({ year, semester }: SemesterIntroCardProps) {
  const locale = useLocale();
  const isHe = locale === "he";
  const [dismissed, setDismissed] = useState(false);

  const key = `${year}-${semester}`;
  const data = SEMESTER_INTROS[key];
  if (!data || dismissed) return null;

  const Icon = data.icon;

  return (
    <div
      className={cn(
        "relative w-full rounded-xl border p-3 transition-all animate-in fade-in slide-in-from-top-2 duration-300",
        data.color
      )}
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 end-2 rounded-full p-0.5 text-current opacity-40 hover:opacity-70 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-2.5">
        <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
        <div className="min-w-0 pe-4">
          <h4 className="text-xs font-bold leading-tight">
            {isHe ? data.titleHe : data.titleEn}
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed opacity-80">
            {isHe ? data.descHe : data.descEn}
          </p>

          {/* Credit range guidance */}
          {data.creditRangeHe && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-medium opacity-80">
              <span><Bidi text={isHe ? data.creditRangeHe! : data.creditRangeEn!} /></span>
            </div>
          )}

          {/* Seminar rules reminder — show for Year 2+ */}
          {year >= 2 && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-black/5 p-2">
              <FileText className="h-3 w-3 shrink-0 mt-0.5 opacity-60" />
              <div className="text-[10px] leading-relaxed opacity-70 space-y-0.5">
                <span className="font-semibold">
                  {isHe ? "תזכורת סמינרים:" : "Seminar rules:"}
                </span>
                <ul className="list-none space-y-0.5">
                  <li>{isHe ? "• צריך 4 סמינרים: 3 עבודות + 1 רפרט" : "• Need 4 seminars: 3 papers + 1 referat"}</li>
                  <li>{isHe ? "• מקסימום 2 סמינרים בכלכלה (רק בשנה ג׳)" : "• Max 2 economics seminars (Year 3 only)"}</li>
                  <li>{isHe ? "• מקסימום 2 סמינרים אצל אותו מרצה" : "• Max 2 seminars with the same lecturer"}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
