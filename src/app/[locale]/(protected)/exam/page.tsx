import { redirect } from "next/navigation";

// Round 13: Exam page merged into dashboard tabs
export default async function ExamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard?tab=exams`);
}
