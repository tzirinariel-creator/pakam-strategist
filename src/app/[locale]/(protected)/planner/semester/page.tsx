import { setRequestLocale } from "next-intl/server";
import { SemesterPlannerPage } from "./semester-planner-page";

export default async function PlannerSemesterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SemesterPlannerPage />;
}
