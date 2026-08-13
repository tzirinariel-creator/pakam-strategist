import { setRequestLocale } from "next-intl/server";
import { LineageContent } from "@/components/lineage/lineage-content";

export default async function LineagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <LineageContent />;
}
