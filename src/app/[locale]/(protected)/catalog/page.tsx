import { setRequestLocale } from "next-intl/server";
import { CatalogContent } from "./catalog-content";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CatalogContent />;
}
