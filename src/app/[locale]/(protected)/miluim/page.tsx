import { setRequestLocale } from "next-intl/server";
import { MiluimPageContent } from "@/components/miluim/miluim-page-content";

export default async function MiluimPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MiluimPageContent />;
}
