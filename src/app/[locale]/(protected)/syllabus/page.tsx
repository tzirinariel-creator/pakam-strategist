import { redirect } from "next/navigation";

// Round 13: Syllabus page merged into dashboard tabs
export default async function SyllabusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard?tab=syllabi`);
}
