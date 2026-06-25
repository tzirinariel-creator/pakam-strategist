"use client";

import { useTranslations, useLocale } from "next-intl";
import {
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

interface SyllabusListProps {
  onSelect: (syllabusId: string) => void;
}

export function SyllabusList({ onSelect }: SyllabusListProps) {
  const t = useTranslations("syllabus");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const utils = api.useUtils();

  const { data: syllabi, isLoading } = api.syllabus.list.useQuery();

  const deleteMutation = api.syllabus.delete.useMutation({
    onSuccess: () => {
      void utils.syllabus.list.invalidate();
      toast.success(t("syllabusDeleted"));
    },
    onError: () => {
      toast.error(tCommon("error"));
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="text-sm text-foreground/50">{tCommon("loading")}</span>
      </div>
    );
  }

  if (!syllabi || syllabi.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/30 p-8">
        <FileText className="h-10 w-10 text-foreground/20" />
        <p className="text-sm text-foreground/50">{t("noSyllabi")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {syllabi.map((syllabus) => (
        <div
          key={syllabus.id}
          className="data-card group flex cursor-pointer flex-col gap-3 p-5 transition-all hover:border-foreground/30"
          onClick={() => onSelect(syllabus.id)}
        >
          {/* Course name */}
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-base font-bold text-foreground/90 line-clamp-1"
              dir="auto"
            >
              {syllabus.courseName}
            </h3>
            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (
                  window.confirm(
                    t("delete") + "?"
                  )
                ) {
                  deleteMutation.mutate({ syllabusId: syllabus.id });
                }
              }}
              className="shrink-0 rounded-md p-1 text-foreground/20 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* File name */}
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-foreground/40" />
            <span className="text-xs text-foreground/50 line-clamp-1">
              {syllabus.fileName}
            </span>
          </div>

          {/* Status and meta */}
          <div className="flex items-center gap-3">
            {/* Parsed status */}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                syllabus.hasParsedContent
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "bg-amber-400/10 text-amber-400"
              )}
            >
              {syllabus.hasParsedContent ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {syllabus.hasParsedContent
                ? t("parsedSuccessfully")
                : t("parse")}
            </div>

            {/* Deadlines count */}
            {syllabus.deadlinesCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-foreground/50">
                <Calendar className="h-3 w-3" />
                {syllabus.deadlinesCount}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="text-xs text-foreground/30">
            {new Date(syllabus.createdAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-US")}
          </div>
        </div>
      ))}
    </div>
  );
}
