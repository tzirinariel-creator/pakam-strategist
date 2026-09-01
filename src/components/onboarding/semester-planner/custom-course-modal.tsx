"use client";

import { useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISCIPLINE_CONFIG, ALL_DISCIPLINE_IDS } from "@/lib/constants";
import { customCourseCode } from "@/lib/off-catalog";
import type { CourseWithSchedule } from "@/lib/plan-generator";

// ─── Types ─────────────────────────────────────────────────────────

/** A student-added course, plus the DECLARATION they made about it (#8).
 *  `declaredDiscipline` non-null = "we declare this course is approved for our
 *  degree, and it counts toward this discipline". null = no declaration — the
 *  course still sits in the plan as a general elective, exactly as before. */
export type CustomCourseDraft = CourseWithSchedule & {
  declaredDiscipline?: string | null;
};

interface CustomCourseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (course: CustomCourseDraft) => void;
}

const DISCIPLINE_OPTIONS = ALL_DISCIPLINE_IDS.map((id) => {
  const cfg = DISCIPLINE_CONFIG[id]!;
  return { value: id, labelHe: cfg.nameHe, labelEn: cfg.nameEn };
});

const DAY_OPTIONS = [
  { value: "SUNDAY", labelHe: "ראשון", labelEn: "Sunday" },
  { value: "MONDAY", labelHe: "שני", labelEn: "Monday" },
  { value: "TUESDAY", labelHe: "שלישי", labelEn: "Tuesday" },
  { value: "WEDNESDAY", labelHe: "רביעי", labelEn: "Wednesday" },
  { value: "THURSDAY", labelHe: "חמישי", labelEn: "Thursday" },
] as const;

// ─── Component ─────────────────────────────────────────────────────

export function CustomCourseModal({
  open,
  onOpenChange,
  onAdd,
}: CustomCourseModalProps) {
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isHe = locale === "he";

  const [name, setName] = useState("");
  const [credits, setCredits] = useState("2");
  const [discipline, setDiscipline] = useState("GENERAL");
  // #8 — the student's declaration that this course is approved for their
  // degree. Off by default: we record what the student tells us, we never
  // assume it (and we never say it on the university's behalf).
  const [declared, setDeclared] = useState(false);
  const [day, setDay] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const reset = useCallback(() => {
    setName("");
    setCredits("2");
    setDiscipline("GENERAL");
    setDeclared(false);
    setDay("");
    setStartTime("");
    setEndTime("");
  }, []);

  const handleAdd = useCallback(() => {
    if (!name.trim()) return;

    const creditsNum = parseFloat(credits) || 2;

    const sessions = day && startTime && endTime
      ? [{
          dayOfWeek: day,
          startTime,
          endTime,
          sessionType: "LECTURE",
        }]
      : [];

    const customCourse: CustomCourseDraft = {
      id: `custom-${crypto.randomUUID()}`,
      // Name-derived (not `Date.now()`), so it matches the code the server mints
      // for the same course — re-adding it upserts the same row instead of
      // piling up a new one on every add.
      code: customCourseCode(name.trim()),
      universityId: null,
      nameHe: name.trim(),
      nameEn: name.trim(),
      // Local colour/filter attribution only. What actually counts toward the
      // degree is `declaredDiscipline` below, persisted per-student.
      discipline: (declared ? discipline : "GENERAL") as CourseWithSchedule["discipline"],
      courseType: "ELECTIVE" as CourseWithSchedule["courseType"],
      credits: creditsNum,
      yearOffered: [1, 2, 3],
      semesterOffered: ["FALL", "SPRING"] as CourseWithSchedule["semesterOffered"],
      prerequisites: [],
      canCountAs: [],
      description: null,
      isMandatory: false,
      attendanceMandatory: true,
      submissionType: "EXAM" as CourseWithSchedule["submissionType"],
      weeklyHours: null,
      examDateA: null,
      examDateB: null,
      averageGrade: null,
      medianGrade: null,
      gradeStdDev: null,
      failRate: null,
      difficultyLevel: null,
      gradeDataSource: null,
      gradeDataYear: null,
      // Not in the shared catalog — the same flag the server keeps on a
      // student-added Course row, so every "outside our catalog" surface reads
      // it the same way (isOffCatalogCourse).
      isActive: false,
      lastSyncedAt: null,
      yedionUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduleSessions: sessions,
      declaredDiscipline: declared ? discipline : null,
    };

    onAdd(customCourse);
    reset();
    onOpenChange(false);
  }, [name, credits, discipline, declared, day, startTime, endTime, onAdd, onOpenChange, reset]);

  const isValid = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isHe ? "הוספת קורס ידני" : "Add Custom Course"}
          </DialogTitle>
          <p className="text-xs text-foreground/60 mt-1">
            {isHe ? "לקורסים שלא נמצאים בקטלוג שלנו (בחירות חיצוניות, סדנאות וכו׳)" : "For courses not in our catalog (external electives, workshops, etc.)"}
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Course name */}
          <div>
            <label className="mb-1 block text-xs text-foreground/60">
              {isHe ? "שם הקורס" : "Course Name"} *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isHe ? "למשל: סדנת כתיבה אקדמית" : "e.g. Academic Writing Workshop"}
              className="text-sm"
            />
          </div>

          {/* Credits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-foreground/60">
                {isHe ? "ש״ס" : "Credits"}
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="text-sm font-mono"
              />
            </div>
          </div>

          {/* #8 — the student's DECLARATION. "לא בקטלוג שלנו" is not "לא מאושר":
              a course can be perfectly approved for a degree and still have
              never been in our list (דוגרי). We can't verify it, and we never
              speak for the מזכירות — so we record what the student tells us,
              show it as theirs, and count it accordingly. */}
          <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={declared}
                onChange={(e) => setDeclared(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent-brand)]"
              />
              <span className="text-xs leading-relaxed text-foreground/80">
                {isHe
                  ? "הקורס מאושר לתואר שלכם — ואתם מצהירים על כך"
                  : "This course is approved for your degree — you're declaring it"}
              </span>
            </label>

            {/* The discipline is part of the declaration: it's what the course
                counts toward. Disabled (never silently ignored) until declared. */}
            <div className="mt-3">
              <label className="mb-1 block text-xs text-foreground/60">
                {isHe ? "נחשב לכם לתחום" : "Counts toward"}
              </label>
              <Select value={discipline} onValueChange={setDiscipline} disabled={!declared}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {isHe ? opt.labelHe : opt.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/60">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
              <span>
                {isHe
                  ? "מי שמאשר קורס לתואר זו המזכירות או הידיעון, לא אנחנו — קורס שאינו בקטלוג שלנו אנחנו לא יכולים לבדוק. מה שתסמנו כאן נשמר כהצהרה שלכם, ומוצג ככזו."
                  : "The secretariat (not us) is what makes a course count — we can't verify a course outside our catalog. What you tick here is saved as your own declaration, and shown as one."}
              </span>
            </p>
          </div>

          {/* Schedule (optional) */}
          <div>
            <label className="mb-1 block text-xs text-foreground/60">
              {isHe ? "מערכת שעות (אופציונלי)" : "Schedule (optional)"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder={isHe ? "יום" : "Day"} />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {isHe ? opt.labelHe : opt.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="text-xs font-mono"
                placeholder="10:00"
              />
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="text-xs font-mono"
                placeholder="12:00"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!isValid}
              onClick={handleAdd}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {isHe ? "הוסף" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
