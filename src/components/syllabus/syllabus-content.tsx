"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  FileText,
  ArrowRight,
  Loader2,
  Sparkles,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { UploadForm } from "./upload-form";
import { SyllabusList } from "./syllabus-list";
import { ParsedContent } from "./parsed-content";
import { cn } from "@/lib/utils";

type ViewState = "list" | "detail" | "uploading";

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

export function SyllabusContent() {
  const t = useTranslations("syllabus");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [view, setView] = useState<ViewState>("list");
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string | null>(
    null
  );

  const utils = api.useUtils();

  // Fetch the selected syllabus detail
  const { data: syllabusDetail, isLoading: isLoadingDetail } =
    api.syllabus.get.useQuery(
      { syllabusId: selectedSyllabusId ?? "" },
      { enabled: !!selectedSyllabusId && view === "detail" }
    );

  // Parse mutation
  const parseMutation = api.syllabus.parse.useMutation({
    onSuccess: () => {
      void utils.syllabus.get.invalidate();
      void utils.syllabus.list.invalidate();
    },
  });

  const handleSelectSyllabus = (syllabusId: string) => {
    setSelectedSyllabusId(syllabusId);
    setView("detail");
  };

  const handleUploaded = (syllabusId: string) => {
    void utils.syllabus.list.invalidate();
    setSelectedSyllabusId(syllabusId);
    setView("detail");
  };

  const handleBack = () => {
    setView("list");
    setSelectedSyllabusId(null);
  };

  const handleParse = () => {
    if (!selectedSyllabusId) return;
    parseMutation.mutate({ syllabusId: selectedSyllabusId });
  };

  // Extract parsed data from detail
  const parsedContent = syllabusDetail?.parsedContent as Record<
    string,
    unknown
  > | null;
  const hasParsedData =
    parsedContent !== null &&
    typeof parsedContent === "object" &&
    "summary" in parsedContent;

  const topics = Array.isArray(syllabusDetail?.topics)
    ? (syllabusDetail.topics as string[])
    : [];
  const deadlines = Array.isArray(parsedContent?.deadlines)
    ? (parsedContent.deadlines as Deadline[])
    : [];
  const gradingBreakdown = Array.isArray(parsedContent?.gradingBreakdown)
    ? (parsedContent.gradingBreakdown as GradingComponent[])
    : [];
  const summary =
    typeof parsedContent?.summary === "string"
      ? parsedContent.summary
      : "";
  const weeklySchedule = Array.isArray(parsedContent?.weeklySchedule)
    ? (parsedContent.weeklySchedule as WeeklyTopic[])
    : null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="animate-stagger-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === "detail" && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 rounded-md p-1.5 text-foreground/50 transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              <ChevronRight className="h-5 w-5 rotate-180" />
            </button>
          )}
          <FileText className="h-8 w-8 text-foreground/80" />
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-bold text-foreground/80 md:text-3xl">
              {t("title")}
            </h1>
            <p className="text-sm text-foreground/60">{t("subtitle")}</p>
          </div>
        </div>

        {/* Toggle upload form */}
        {view === "list" && (
          <button
            onClick={() => setView("uploading")}
            className="flex items-center gap-2 rounded-md border border-foreground/30 bg-foreground/10 px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/20"
          >
            <Sparkles className="h-4 w-4" />
            {t("upload")}
          </button>
        )}

        {view === "uploading" && (
          <button
            onClick={() => setView("list")}
            className="flex items-center gap-2 rounded-md border border-border/30 px-3 py-2 text-sm text-foreground/60 transition-colors hover:bg-muted/20"
          >
            {tCommon("back")}
          </button>
        )}
      </div>

      {/* Upload form view */}
      {view === "uploading" && (
        <div className="animate-stagger-2">
          <UploadForm onUploaded={handleUploaded} />
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="animate-stagger-2">
          <SyllabusList onSelect={handleSelectSyllabus} />
        </div>
      )}

      {/* Detail view */}
      {view === "detail" && (
        <div className="animate-stagger-2 flex flex-col gap-4">
          {/* Loading state */}
          {isLoadingDetail && (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-foreground/80" />
              <span className="text-muted-foreground">
                {tCommon("loading")}
              </span>
            </div>
          )}

          {/* Syllabus detail */}
          {syllabusDetail && (
            <>
              {/* Syllabus info card */}
              <div className="data-card flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-foreground/80" />
                  <div className="flex flex-col gap-0.5">
                    <h2
                      className="text-lg font-bold text-foreground"
                      dir="auto"
                    >
                      {locale === "he" ? syllabusDetail.course.nameHe : (syllabusDetail.course.nameEn ?? syllabusDetail.course.nameHe)}
                    </h2>
                    <span className="text-xs text-foreground/50">
                      {syllabusDetail.fileName}
                    </span>
                  </div>
                </div>

                {/* Parse button — show if not yet parsed */}
                {!hasParsedData && (
                  <button
                    onClick={handleParse}
                    disabled={parseMutation.isPending}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 font-bold text-sm font-medium transition-all",
                      parseMutation.isPending
                        ? "cursor-not-allowed bg-muted/30 text-foreground/30"
                        : "bg-foreground text-black hover:bg-foreground/90"
                    )}
                  >
                    {parseMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("parsing")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {t("parse")}
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Parse error */}
              {parseMutation.error && (
                <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-destructive">
                      {tCommon("error")}
                    </span>
                    <span className="text-xs text-destructive/70">
                      {parseMutation.error.message}
                    </span>
                  </div>
                </div>
              )}

              {/* No API key warning */}
              {!hasParsedData && !parseMutation.isPending && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                  <span className="text-sm text-amber-400">
                    {t("noApiKey")}
                  </span>
                  <ArrowRight className="h-4 w-4 text-amber-400" />
                </div>
              )}

              {/* Parsed content display */}
              {hasParsedData && (
                <div className="animate-stagger-3">
                  <ParsedContent
                    topics={topics}
                    deadlines={deadlines}
                    gradingBreakdown={gradingBreakdown}
                    summary={summary}
                    weeklySchedule={weeklySchedule}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
