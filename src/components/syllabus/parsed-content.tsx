"use client";

import { useTranslations } from "next-intl";
import {
  BookOpen,
  Calendar,
  BarChart3,
  FileText,
  ClipboardList,
  Pencil,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// -------------------------------------------------------------------
// Types matching the AI parser output
// -------------------------------------------------------------------

interface Deadline {
  title: string;
  date: string;
  type: "exam" | "assignment" | "paper";
}

interface GradingComponent {
  component: string;
  weight: number;
}

interface WeeklyTopic {
  week: number;
  topic: string;
  readings?: string;
}

interface ParsedContentProps {
  topics: string[];
  deadlines: Deadline[];
  gradingBreakdown: GradingComponent[];
  summary: string;
  weeklySchedule?: WeeklyTopic[] | null;
  onEdit?: () => void;
}

// -------------------------------------------------------------------
// Deadline type color map
// -------------------------------------------------------------------

const deadlineColors: Record<Deadline["type"], { bg: string; text: string; border: string }> = {
  exam: {
    bg: "bg-red-400/10",
    text: "text-red-400",
    border: "border-red-400/30",
  },
  assignment: {
    bg: "bg-amber-400/10",
    text: "text-amber-400",
    border: "border-amber-400/30",
  },
  paper: {
    bg: "bg-blue-400/10",
    text: "text-blue-400",
    border: "border-blue-400/30",
  },
};

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export function ParsedContent({
  topics,
  deadlines,
  gradingBreakdown,
  summary,
  weeklySchedule,
  onEdit,
}: ParsedContentProps) {
  const t = useTranslations("syllabus");

  return (
    <div className="data-card flex flex-col gap-4 p-6">
      {/* Header with edit button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground/80">
          {t("parsedSuccessfully")}
        </h2>
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-md border border-foreground/30 bg-foreground/10 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/20"
          >
            <Pencil className="h-3 w-3" />
            {t("editParsed")}
          </button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="topics" className="w-full">
        <TabsList className="w-full bg-muted/20">
          <TabsTrigger value="topics" className="flex-1 gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("topics")}</span>
          </TabsTrigger>
          <TabsTrigger value="deadlines" className="flex-1 gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("deadlines")}</span>
          </TabsTrigger>
          <TabsTrigger value="grading" className="flex-1 gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("grading")}</span>
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex-1 gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("summary")}</span>
          </TabsTrigger>
          {weeklySchedule && weeklySchedule.length > 0 && (
            <TabsTrigger value="weekly" className="flex-1 gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("weeklySchedule")}</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Topics tab */}
        <TabsContent value="topics" className="mt-4">
          <TopicsList topics={topics} />
        </TabsContent>

        {/* Deadlines tab */}
        <TabsContent value="deadlines" className="mt-4">
          <DeadlinesTimeline deadlines={deadlines} />
        </TabsContent>

        {/* Grading tab */}
        <TabsContent value="grading" className="mt-4">
          <GradingChart breakdown={gradingBreakdown} />
        </TabsContent>

        {/* Summary tab */}
        <TabsContent value="summary" className="mt-4">
          <SummaryBlock text={summary} />
        </TabsContent>

        {/* Weekly schedule tab */}
        {weeklySchedule && weeklySchedule.length > 0 && (
          <TabsContent value="weekly" className="mt-4">
            <WeeklyScheduleList schedule={weeklySchedule} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function TopicsList({ topics }: { topics: string[] }) {
  const t = useTranslations("syllabus");

  if (topics.length === 0) {
    return (
      <p className="text-sm text-foreground/50">{t("noSyllabi")}</p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {topics.map((topic, index) => (
        <li
          key={index}
          className="flex items-start gap-3 rounded-lg border border-border/20 bg-muted/10 px-4 py-3"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/20 text-xs font-bold text-foreground/80">
            {index + 1}
          </span>
          <span className="text-sm text-foreground/80" dir="auto">
            {topic}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DeadlinesTimeline({ deadlines }: { deadlines: Deadline[] }) {
  const t = useTranslations("syllabus");

  if (deadlines.length === 0) {
    return (
      <p className="text-sm text-foreground/50">{t("noSyllabi")}</p>
    );
  }

  // Sort by date
  const sorted = [...deadlines].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="relative flex flex-col gap-4">
      {/* Timeline line */}
      <div className="absolute bottom-0 top-0 start-[11px] w-0.5 bg-border/30" />

      {sorted.map((deadline, index) => {
        const colors = deadlineColors[deadline.type];
        const typeLabel = t(deadline.type);

        return (
          <div key={index} className="relative flex items-start gap-4 ps-8">
            {/* Timeline dot */}
            <div
              className={cn(
                "absolute start-0 top-1 h-6 w-6 rounded-full border-2",
                colors.border,
                colors.bg
              )}
            >
              <div
                className={cn(
                  "absolute inset-[5px] rounded-full",
                  colors.text === "text-red-400"
                    ? "bg-red-400"
                    : colors.text === "text-amber-400"
                      ? "bg-amber-400"
                      : "bg-blue-400"
                )}
              />
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground" dir="auto">
                  {deadline.title}
                </span>
                <Badge
                  className={cn(
                    "text-[10px]",
                    colors.bg,
                    colors.text,
                    `border ${colors.border}`
                  )}
                >
                  {typeLabel}
                </Badge>
              </div>
              <span className="font-data text-xs text-foreground/50">
                {formatDate(deadline.date)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GradingChart({ breakdown }: { breakdown: GradingComponent[] }) {
  const t = useTranslations("syllabus");

  if (breakdown.length === 0) {
    return (
      <p className="text-sm text-foreground/50">{t("noSyllabi")}</p>
    );
  }

  // Color palette for bars
  const barColors = [
    "bg-foreground",
    "bg-emerald-400",
    "bg-blue-400",
    "bg-purple-400",
    "bg-amber-400",
    "bg-rose-400",
    "bg-teal-400",
    "bg-indigo-400",
  ];

  return (
    <div className="flex flex-col gap-3">
      {breakdown.map((item, index) => {
        const color = barColors[index % barColors.length] ?? "bg-foreground";

        return (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/80" dir="auto">
                {item.component}
              </span>
              <span className="font-data text-sm font-bold text-foreground/70">
                {item.weight}%
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted/20">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out",
                  color
                )}
                style={{ width: `${Math.min(item.weight, 100)}%` }}
              />
            </div>
          </div>
        );
      })}

      {/* Total */}
      <div className="mt-2 flex items-center justify-between border-t border-border/20 pt-2">
        <span className="text-sm font-medium text-foreground/60">
          {/* Total label */}
        </span>
        <span className="font-data text-sm font-bold text-foreground/80">
          {breakdown.reduce((sum, item) => sum + item.weight, 0)}%
        </span>
      </div>
    </div>
  );
}

function SummaryBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border/20 bg-muted/10 p-4">
      <p className="text-sm leading-relaxed text-foreground/80" dir="auto">
        {text}
      </p>
    </div>
  );
}

function WeeklyScheduleList({ schedule }: { schedule: WeeklyTopic[] }) {
  return (
    <div className="flex flex-col gap-2">
      {schedule.map((week, index) => (
        <div
          key={index}
          className="flex items-start gap-3 rounded-lg border border-border/20 bg-muted/10 px-4 py-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/20 font-data text-xs font-bold text-foreground/80">
            {week.week}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground/80" dir="auto">
              {week.topic}
            </span>
            {week.readings && (
              <span className="text-xs text-foreground/50" dir="auto">
                {week.readings}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("he-IL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}
