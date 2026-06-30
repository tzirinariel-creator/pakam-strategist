import { setRequestLocale } from "next-intl/server";
import { MentorPageClient } from "@/components/mentor/mentor-page-client";

export default async function MentorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Two modes: instant deterministic Q&A (free, no key) and the Gemini-powered
  // AI chat (richer, grounded in the student's plan — free via a Gemini key).
  return <MentorPageClient />;
}
