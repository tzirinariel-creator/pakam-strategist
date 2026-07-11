import { setRequestLocale } from "next-intl/server";
import { CohortFileContent } from "@/components/cohort/cohort-file-content";

export default async function CohortPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CohortFileContent />;
}
