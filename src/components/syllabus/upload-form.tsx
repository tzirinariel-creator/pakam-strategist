"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Upload, FileText, X, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UploadFormProps {
  onUploaded: (syllabusId: string) => void;
}

export function UploadForm({ onUploaded }: UploadFormProps) {
  const t = useTranslations("syllabus");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [textContent, setTextContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch user courses for the dropdown
  const { data: courses } = api.course.list.useQuery();

  const uploadMutation = api.syllabus.upload.useMutation({
    onSuccess: (data) => {
      onUploaded(data.syllabusId);
      setTextContent("");
      setFileName("");
      setSelectedCourseId("");
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file) {
        setFileName(file.name);
        // For now, read as text
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result;
          if (typeof result === "string") {
            setTextContent(result);
          }
        };
        reader.readAsText(file);
      }
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file) {
          setFileName(file.name);
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result;
            if (typeof result === "string") {
              setTextContent(result);
            }
          };
          reader.readAsText(file);
        }
      }
    },
    []
  );

  const handleUpload = () => {
    if (!selectedCourseId || !textContent.trim()) return;

    const finalFileName =
      fileName || `syllabus-${new Date().toISOString().slice(0, 10)}.txt`;

    uploadMutation.mutate({
      courseId: selectedCourseId,
      fileName: finalFileName,
      fileContent: textContent,
    });
  };

  const clearFile = () => {
    setFileName("");
    setTextContent("");
  };

  const isReady = selectedCourseId && textContent.trim().length > 0;

  return (
    <div className="data-card flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <Upload className="h-5 w-5 text-foreground/80" />
        <h2 className="text-lg font-bold text-foreground/80">
          {t("upload")}
        </h2>
      </div>

      {/* Course selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground/70">
          {t("selectCourse")}
        </label>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger className="w-full border-border/50 bg-muted/20">
            <SelectValue placeholder={t("selectCourse")} />
          </SelectTrigger>
          <SelectContent>
            {courses?.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {locale === "he" ? course.nameHe : (course.nameEn ?? course.nameHe)}
                {locale === "he"
                  ? (course.nameEn ? ` / ${course.nameEn}` : "")
                  : ` / ${course.nameHe}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Drag-and-drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors",
          isDragging
            ? "border-foreground bg-foreground/10"
            : "border-border/40 bg-muted/10 hover:border-foreground/40"
        )}
      >
        {fileName ? (
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-foreground/80" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {fileName}
              </span>
              <span className="text-xs text-foreground/50">
                {textContent.length.toLocaleString()} characters
              </span>
            </div>
            <button
              type="button"
              onClick={clearFile}
              aria-label={t("clearFile")}
              className="rounded-full p-1 text-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload
              className={cn(
                "h-8 w-8",
                isDragging ? "text-foreground/80" : "text-foreground/30"
              )}
            />
            <span className="text-sm text-foreground/50">
              {t("uploadHint")}
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileSelect}
              aria-label={t("chooseFile")}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </>
        )}
      </div>

      {/* Text area for pasting */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground/70">
          {t("pasteContent")}
        </label>
        <textarea
          ref={textareaRef}
          value={textContent}
          onChange={(e) => {
            setTextContent(e.target.value);
            if (!fileName && e.target.value.trim()) {
              setFileName("pasted-syllabus.txt");
            }
          }}
          placeholder={t("pasteContent")}
          className="min-h-[160px] w-full resize-y rounded-lg border border-border/40 bg-muted/10 p-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/30"
          dir="auto"
        />
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!isReady || uploadMutation.isPending}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold text-sm font-medium transition-all",
          isReady && !uploadMutation.isPending
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "cursor-not-allowed bg-muted/30 text-foreground/30"
        )}
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {tCommon("loading")}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {t("upload")}
          </>
        )}
      </button>

      {/* Error display */}
      {uploadMutation.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {uploadMutation.error.message}
        </div>
      )}
    </div>
  );
}
