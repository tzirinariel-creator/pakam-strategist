import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { RadixDirection } from "@/components/providers/radix-direction";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Per-locale title/description/OG so an English route no longer emits the root's
// Hebrew share card (#audit-r4). Merges over the root layout's metadataBase +
// appleWebApp; only title/description/openGraph/twitter are localized.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const he = locale !== "en";
  const title = he ? "Pakamon | פכמון" : "Pakamon — TAU PPE degree planner";
  const description = he
    ? "תכנון אקדמי חכם לתואר פילוסופיה, כלכלה ומדע המדינה — אוניברסיטת תל אביב"
    : "Smart academic planning for the Tel Aviv University Philosophy, Economics & Political Science (PPE) degree.";
  const images = [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pakamon" }];
  return {
    title,
    description,
    openGraph: { title, description, images, locale: he ? "he_IL" : "en_US", type: "website" },
    twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale
  if (!routing.locales.includes(locale as "he" | "en")) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <RadixDirection dir={locale === "he" ? "rtl" : "ltr"}>
        {children}
        <Toaster />
      </RadixDirection>
    </NextIntlClientProvider>
  );
}
