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
  // 4.9 — זה כל מה שסטודנט קורא בכרטיס של וואטסאפ לפני שהוא מחליט אם
  // ללחוץ, והקישור רץ בקבוצות בדיוק בשבוע הבידינג. הניסוח הקודם — "תכנון
  // אקדמי חכם" — לא הזכיר בידינג באף מילה, וגם לא מחיר; והשאלה הראשונה
  // שנשאלת בקבוצה על כל קישור היא "זה בתשלום?".
  //
  // **בלי תאריך.** הדף נבנה סטטית, אז "מקצה 1 נפתח ב-7.9" היה קופא
  // בזמן ה-build וממשיך להופיע אחרי שהמקצה נסגר. הרצועה בדף עצמה כן
  // נושאת ספירה חיה, כי היא מרונדרת בזמן אמת.
  const description = he
    ? "גיליון בידינג עם זיהוי חפיפות, מערכת שעות ותכנון תואר לפכ״מ בת״א. חינם."
    : "Course-bidding worksheet with clash detection, timetable and degree planning for TAU PPE. Free.";
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
