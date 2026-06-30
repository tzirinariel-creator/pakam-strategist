import { setRequestLocale } from "next-intl/server";
import { DegreeAssistant } from "@/components/mentor/degree-assistant";

export default async function MentorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Deterministic, free, no-API-key assistant — answers from the student's own
  // data + the app's domain knowledge (replaces the BYOK Claude chat).
  return <DegreeAssistant />;
}
