import { setRequestLocale } from "next-intl/server";
import { GradeCalculatorContent } from "@/components/graduation/grade-calculator-content";

export default async function GraduationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <GradeCalculatorContent />;
}
