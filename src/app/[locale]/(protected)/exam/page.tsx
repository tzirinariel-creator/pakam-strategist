import { setRequestLocale } from "next-intl/server";
import { ExamSchedule } from "@/components/exam/exam-schedule";
import { StudyPlannerWidget } from "@/components/dashboard/study-planner-widget";

// The exam board used to live behind a dashboard tab (this page redirected into
// it). The home-screen redesign dissolved those tabs, so the board is now its
// own page — reachable from the dashboard "My week" zone and by URL.
export default async function ExamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isHe = locale === "he";

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground/85">
          {isHe ? "לוח הבחינות" : "Exam schedule"}
        </h1>
        <p className="mt-0.5 text-xs text-foreground/50">
          {isHe ? "כל הבחינות הקרובות שלכם, לפי תאריך" : "All your upcoming exams, by date"}
        </p>
      </div>
      <ExamSchedule />

      {/* If the student built a study plan from these exams, show it here too so
          the exam board and the plan aren't disconnected (#10). Hidden when empty. */}
      <StudyPlannerWidget isHe={isHe} hideWhenEmpty />
    </div>
  );
}
