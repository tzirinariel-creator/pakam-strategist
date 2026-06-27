import { setRequestLocale } from "next-intl/server";
import { AcademicRecordContent } from "@/components/record/academic-record-content";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AcademicRecordContent />;
}
