import { setRequestLocale } from "next-intl/server";
import { ExamPlannerContent } from "./exam-planner-content";

export default async function ExamPlannerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ExamPlannerContent />;
}
